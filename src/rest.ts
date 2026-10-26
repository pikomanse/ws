/**
 * The HTTP API, for Node backends, scripts and tools. Never in a browser: the API key would be in
 * the page. Each request carries `Authorization: Bearer <jwt>`, a token signed with an API key for
 * that request alone (KEYS.md).
 */
import {KeyWithId, requestToken, SignedRequest, startSecretImport} from './keys';
import {encryptEvent, eventJson, isEncryptedChannel, channelKey, startMasterKeyImport} from './encryption';
import {CLIENT_EVENT_PREFIX} from './client_events';
import {INSPECT, refuseInBrowser} from './redact';
import {checkedAddress} from './names';
import {kickFields} from './kick';

export const DEFAULT_API_ADDRESS = 'https://next-api.pikoman.se';

export interface RestOptions {
    /** The app id. Default: `PIKOMAN_APP`. */
    app?: string;
    /** The API key's secret, `sk_<key id>.<seed>`. Default: `PIKOMAN_API_KEY`. */
    apiKey?: string;
    /** The app's master key (base64), for `private-encrypted-` channels. Default: `PIKOMAN_ENCRYPTION_KEY`. */
    encryptionKey?: string;
    /** Default: `https://next-api.pikoman.se` (2.0, until it moves to the usual address). */
    address?: string;
}

function env(name: string): string | undefined {
    const process = (globalThis as any).process;
    return process && process.env ? process.env[name] : undefined;
}

/**
 * A channel or event name as one segment of the request's path. encodeURIComponent encodes "/"
 * and "%", so no name can reach another segment, except "." and "..", which the URL parser
 * (fetch's too) reads as steps in the path: `publish("..", "mass_events")` would go out as
 * `POST /mass_events`. Those are refused, and so is an empty name.
 */
function pathSegment(kind: 'channel' | 'event', name: string): string {
    if (typeof name !== 'string' || name === '' || name === '.' || name === '..') {
        const shown = typeof name === 'string' ? JSON.stringify(name) : String(name);
        throw new Error(`Pikoman: ${shown} is not a${kind === 'event' ? 'n' : ''} ${kind} name (it cannot be empty, "." or "..")`);
    }
    return encodeURIComponent(name);
}

/**
 * What a Rest holds that must not be seen: the API key and the master key (both non-extractable
 * CryptoKeys, no raw bytes kept). In a WeakMap, so neither JSON.stringify nor util.inspect of a
 * Rest can reach them.
 */
interface Secrets {
    key: Promise<KeyWithId>;
    masterKey?: Promise<CryptoKey>;
}

const secrets = new WeakMap<Rest, Secrets>();

/** `publish` to one member of the channel: a connection id, or every connection of a user. */
export interface PublishOptions {
    to?: string;
    toUser?: string;
}

export interface ChannelsOptions {
    prefix?: string;
    info?: Array<'user_count' | 'subscription_count' | 'message_count'>;
    limit?: number;
    after?: string;
}

/** `GET /channels`, in Pusher's shape. */
export interface ChannelList {
    channels: Record<string, {user_count?: number, subscription_count?: number, message_count?: number}>;
    next?: string;
    app_message_count?: number;
}

export class Rest {
    private readonly app: string;
    private readonly address: string;

    constructor(options: RestOptions = {}) {
        refuseInBrowser('Rest');
        const app = options.app ?? env('PIKOMAN_APP');
        const apiKey = options.apiKey ?? env('PIKOMAN_API_KEY');
        if (!app) {
            throw new Error('Need the app id (option app, or PIKOMAN_APP)');
        }
        if (!apiKey) {
            throw new Error('Need an API key (option apiKey, or PIKOMAN_API_KEY)');
        }
        this.app = app;
        const {keyId, key} = startSecretImport(apiKey);
        const secret: Secrets = {key: key.then((imported) => ({keyId, key: imported}))};
        secret.key.catch(() => undefined);
        const encryptionKey = options.encryptionKey ?? env('PIKOMAN_ENCRYPTION_KEY');
        if (encryptionKey) {
            // A malformed master key is reported when an encrypted channel needs it, not here,
            // so a Rest for plain channels keeps working.
            try {
                secret.masterKey = startMasterKeyImport(encryptionKey);
            } catch (e) {
                secret.masterKey = Promise.reject(e);
            }
            secret.masterKey.catch(() => undefined);
        }
        secrets.set(this, secret);
        this.address = checkedAddress(options.address ?? DEFAULT_API_ADDRESS, 'https', 'http');
    }

    private get secret(): Secrets {
        return secrets.get(this) as Secrets;
    }

    /** `Bearer <jwt>` for this one request: a new token every time, see `requestToken`. */
    async authorization(request: SignedRequest): Promise<string> {
        return `Bearer ${await requestToken(await this.secret.key, this.app, request)}`;
    }

    /**
     * Publishes an event: `POST /{channel}/{event}` with the data as JSON. In a
     * `private-encrypted-` channel the data is encrypted with the master key first. Names that
     * start with `client-` are members' client events, which a backend never publishes, and
     * empty names, "." and ".." are refused (see `pathSegment`).
     */
    async publish(channel: string, event: string, data: any, options: PublishOptions = {}): Promise<number> {
        let path = `/${pathSegment('channel', channel)}/${pathSegment('event', event)}`;
        if (options.to !== undefined && options.toUser !== undefined) {
            throw new Error('Pikoman: name either to or toUser, not both');
        }
        for (const [name, value] of [['to', options.to], ['to_user', options.toUser]] as const) {
            if (value !== undefined) {
                if (typeof value !== 'string' || value === '' || value.length > 128) {
                    throw new Error(`Pikoman: ${name} is 1-128 characters`);
                }
                path += `?${name}=${encodeURIComponent(value)}`;
            }
        }
        if (event.startsWith(CLIENT_EVENT_PREFIX)) {
            throw new Error(`Pikoman: ${event}: names that start with ${CLIENT_EVENT_PREFIX} are members' client events, never published by a backend`);
        }
        let body = data === undefined ? null : data;
        if (isEncryptedChannel(channel)) {
            const masterKey = this.secret.masterKey;
            if (!masterKey) {
                throw new Error(`${channel} is encrypted: need the master key (option encryptionKey, or PIKOMAN_ENCRYPTION_KEY)`);
            }
            body = await encryptEvent(channel, event, body, await channelKey(await masterKey, this.app, channel), 'server');
        }
        const url = `${this.address}${path}`;
        const json = eventJson(body);
        const response = await fetch(url, {
            method: 'POST',
            headers: {'Authorization': await this.authorization({method: 'POST', url, body: json}), 'Content-Type': 'application/json'},
            body: json,
        });
        if (!response.ok) {
            let reason = '';
            try {
                reason = (await response.json()).error ?? '';
            } catch (e) {
                // Not JSON: the status says enough.
            }
            throw new Error(`Pikoman: publish to ${channel} failed: ${response.status}${reason ? ` ${reason}` : ''}`);
        }
        try {
            return Number((await response.json()).clients ?? 0);
        } catch (e) {
            return 0;
        }
    }

    /**
     * The app's occupied channels that the key may see (scope `stats`): `GET /channels`, a page at
     * a time, in name order. `info` asks for `user_count` (presence channels), `subscription_count`
     * and `message_count` (messages since the channel became occupied). Pass the answer's `next`
     * as `after` for the next page.
     */
    async channels(options: ChannelsOptions = {}): Promise<ChannelList> {
        const query = new URLSearchParams();
        if (options.prefix) query.set('prefix', options.prefix);
        if (options.info?.length) query.set('info', options.info.join(','));
        if (options.limit !== undefined) query.set('limit', String(options.limit));
        if (options.after) query.set('after', options.after);
        const search = query.toString();
        const url = `${this.address}/channels${search ? `?${search}` : ''}`;
        return this.getJson(url, 'channels');
    }

    /**
     * Removes a member from one channel (scope `kick`; `ban` with `banSeconds`):
     * `DELETE /{channel}/clients?to=…` for a connection id, or `?to_user=…` with `{ userId }` for
     * every connection of that user. The member is told `kicked` with the reason, leaves this
     * channel only and, with `banSeconds` (at most 86 400), may not join it again until then.
     * Resolves with how many connections left, and with a ban whether it was recorded (a
     * channel holds at most 100 bans).
     */
    async kick(channel: string, member: string | {userId: string}, options: {reason?: string, banSeconds?: number} = {}): Promise<{kicked: number, banned?: boolean}> {
        const query = new URLSearchParams();
        if (typeof member === 'string' && member !== '' && member.length <= 128) {
            query.set('to', member);
        } else if (member && typeof member === 'object' && typeof member.userId === 'string' && member.userId !== '' && member.userId.length <= 128) {
            query.set('to_user', member.userId);
        } else {
            throw new Error('Pikoman: kick needs a connection id or { userId }, 1-128 characters');
        }
        const fields = kickFields(options);
        if (fields.reason !== undefined) query.set('reason', fields.reason);
        if (fields.ban_seconds !== undefined) query.set('ban_seconds', String(fields.ban_seconds));
        const url = `${this.address}/${pathSegment('channel', channel)}/clients?${query.toString()}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {'Authorization': await this.authorization({method: 'DELETE', url, body: ''})},
        });
        let json: any = null;
        try {
            json = await response.json();
        } catch (e) {
            // Not JSON: the status says enough.
        }
        if (!response.ok) {
            throw new Error(`Pikoman: kick in ${channel} failed: ${response.status}${json?.error ? ` ${json.error}` : ''}`);
        }
        return json;
    }

    /**
     * Closes one connection, in every channel (scope `disconnect`): `DELETE /connection/{id}`.
     * The client is told with close code 4401 and does not connect again by itself
     * (`disconnected`). App-wide: the key's channels do not limit it, so give it only to a key
     * that should be able to throw anyone out. Resolves with whether the connection was found.
     */
    async disconnect(connectionId: string): Promise<boolean> {
        if (typeof connectionId !== 'string' || connectionId === '' || connectionId.length > 128) {
            throw new Error('Pikoman: disconnect needs a connection id, 1-128 characters');
        }
        const url = `${this.address}/connection/${encodeURIComponent(connectionId)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {'Authorization': await this.authorization({method: 'DELETE', url, body: ''})},
        });
        let json: any = null;
        try {
            json = await response.json();
        } catch (e) {
            // Not JSON: the status says enough.
        }
        if (!response.ok) {
            throw new Error(`Pikoman: disconnect of ${connectionId} failed: ${response.status}${json?.error ? ` ${json.error}` : ''}`);
        }
        return json?.kicked === true;
    }

    /** `GET /{channel}/stats` (scope `stats`): connections in it, and messages since it became occupied. */
    async stats(channel: string): Promise<{clients: number, message_count: number}> {
        const url = `${this.address}/${pathSegment('channel', channel)}/stats`;
        return this.getJson(url, `stats of ${channel}`);
    }

    private async getJson(url: string, what: string): Promise<any> {
        const response = await fetch(url, {
            method: 'GET',
            headers: {'Authorization': await this.authorization({method: 'GET', url, body: ''})},
        });
        let json: any = null;
        try {
            json = await response.json();
        } catch (e) {
            // Not JSON: the status says enough.
        }
        if (!response.ok) {
            throw new Error(`Pikoman: ${what} failed: ${response.status}${json?.error ? ` ${json.error}` : ''}`);
        }
        return json;
    }

    /** What JSON.stringify shows: never the API key or the master key. */
    toJSON() {
        return {app: this.app, address: this.address, apiKey: '[hidden]', encryptionKey: this.secret.masterKey ? '[hidden]' : null};
    }

    [INSPECT]() {
        return `Rest { app: ${JSON.stringify(this.app)}, address: ${JSON.stringify(this.address)}, apiKey: [hidden]${this.secret.masterKey ? ', encryptionKey: [hidden]' : ''} }`;
    }
}

let shared: Rest | undefined;

/**
 * Publishes with `PIKOMAN_APP`, `PIKOMAN_API_KEY` and, for encrypted channels,
 * `PIKOMAN_ENCRYPTION_KEY`. For other settings, use `new Rest({...}).publish(...)`.
 */
export function publish(channel: string, event: string, data: any, options?: PublishOptions): Promise<number> {
    if (!shared) {
        shared = new Rest();
    }
    return shared.publish(channel, event, data, options);
}
