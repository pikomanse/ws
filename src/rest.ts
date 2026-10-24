/**
 * The HTTP API, for Node backends, scripts and tools. Never in a browser: the API key would be in
 * the page. Requests carry `Authorization: Bearer <jwt>` signed with an API key (KEYS.md).
 */
import {KeyWithId, requestToken, startSecretImport} from './keys';
import {encryptEvent, isEncryptedChannel, channelKey, startMasterKeyImport} from './encryption';
import {INSPECT} from './redact';

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

/** A request token is made to live five minutes and reused for four. */
const TOKEN_LIFETIME = 300;
const TOKEN_REUSE = 240;

function env(name: string): string | undefined {
    const process = (globalThis as any).process;
    return process && process.env ? process.env[name] : undefined;
}

/**
 * What a Rest holds that must not be seen: the API key, the master key (both non-extractable
 * CryptoKeys, no raw bytes kept) and the cached request token. In a WeakMap, so neither
 * JSON.stringify nor util.inspect of a Rest can reach them.
 */
interface Secrets {
    key: Promise<KeyWithId>;
    masterKey?: Promise<CryptoKey>;
    token?: { value: string, until: number };
}

const secrets = new WeakMap<Rest, Secrets>();

export class Rest {
    private readonly app: string;
    private readonly address: string;

    constructor(options: RestOptions = {}) {
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
        this.address = (options.address ?? DEFAULT_API_ADDRESS).replace(/\/+$/, '');
    }

    private get secret(): Secrets {
        return secrets.get(this) as Secrets;
    }

    /** `Bearer <jwt>`, a fresh token every four minutes. */
    async authorization(): Promise<string> {
        const secret = this.secret;
        const now = Date.now() / 1000;
        if (!secret.token || secret.token.until <= now) {
            secret.token = {value: await requestToken(await secret.key, this.app, TOKEN_LIFETIME), until: now + TOKEN_REUSE};
        }
        return `Bearer ${secret.token.value}`;
    }

    /**
     * Publishes an event: `POST /{channel}/{event}` with the data as JSON. In a
     * `private-encrypted-` channel the data is encrypted with the master key first.
     */
    async publish(channel: string, event: string, data: any): Promise<void> {
        let body = data === undefined ? null : data;
        if (isEncryptedChannel(channel)) {
            const masterKey = this.secret.masterKey;
            if (!masterKey) {
                throw new Error(`${channel} is encrypted: need the master key (option encryptionKey, or PIKOMAN_ENCRYPTION_KEY)`);
            }
            body = await encryptEvent(channel, event, body, await channelKey(await masterKey, channel), 'server');
        }
        const response = await fetch(`${this.address}/${encodeURIComponent(channel)}/${encodeURIComponent(event)}`, {
            method: 'POST',
            headers: {'Authorization': await this.authorization(), 'Content-Type': 'application/json'},
            body: JSON.stringify(body),
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
    }

    /** What JSON.stringify shows: never the API key, the master key or the token. */
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
export function publish(channel: string, event: string, data: any): Promise<void> {
    if (!shared) {
        shared = new Rest();
    }
    return shared.publish(channel, event, data);
}
