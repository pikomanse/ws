/**
 * @jest-environment node
 */
import {createHash, createPrivateKey, createPublicKey, webcrypto} from 'crypto';
import {
    MasterKeyAuthenticator,
    OfflineAuthenticator,
    importSecret,
    parseSecret,
    requestToken,
    authorizationHeader,
    REQUEST_TOKEN_LIFETIME,
    SignedRequest,
    Rest,
    channelKey,
    decryptEvent,
} from '../src';
import {installWebGlobals} from './web_globals';
import {authChannelWithKey} from '../src/authenticators/offline_authenticator';

// Test keys only: the seed of sevens, as in the server's tests. Never used for a real app.
const SEED = Buffer.alloc(32, 7);
const KEY_ID = 'k_3f9a1c0e5b7d2468';
const SECRET = `sk_${KEY_ID}.${SEED.toString('base64url')}`;
const PKCS8_BASE64 = 'MC4CAQAwBQYDK2VwBCIEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH';

function decode(part: string): any {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Checks a JWT's signature with the public key of the seed of sevens, through Web Crypto. */
async function verify(token: string): Promise<boolean> {
    const der = createPublicKey(createPrivateKey({key: Buffer.from(PKCS8_BASE64, 'base64'), format: 'der', type: 'pkcs8'}))
        .export({type: 'spki', format: 'der'}) as Buffer;
    const publicKey = await webcrypto.subtle.importKey('raw', der.subarray(der.length - 32), {name: 'Ed25519'}, false, ['verify']);
    const [header, payload, signature] = token.split('.');
    return webcrypto.subtle.verify({name: 'Ed25519'}, publicKey, Buffer.from(signature, 'base64url'), Buffer.from(`${header}.${payload}`));
}

beforeAll(installWebGlobals);

describe('API key secrets', () => {
    it('Should read the key id and the seed', () => {
        const {keyId, seed} = parseSecret(SECRET);
        expect(keyId).toBe(KEY_ID);
        expect(Buffer.from(seed)).toEqual(SEED);
    });

    it('Should refuse malformed secrets', () => {
        const seed = SEED.toString('base64url');
        const malformed = [
            '',
            seed,
            `${KEY_ID}.${seed}`,                       // no sk_
            `sk_${KEY_ID}${seed}`,                     // no dot
            `sk_k_3F9A1C0E5B7D2468.${seed}`,           // upper-case hex
            `sk_k_3f9a1c0e5b7d246.${seed}`,            // 15 hex
            `sk_k_3f9a1c0e5b7d24680.${seed}`,          // 17 hex
            `sk_x_3f9a1c0e5b7d2468.${seed}`,           // not k_
            `sk_${KEY_ID}.${seed.slice(1)}`,           // 42 characters
            `sk_${KEY_ID}.${seed}A`,                   // 44 characters
            `sk_${KEY_ID}.${seed}=`,                   // padding
            `sk_${KEY_ID}.${seed.slice(0, 42)}+`,      // standard base64
            `sk_${KEY_ID}.${seed.slice(0, 42)}d`,      // a non-canonical last character
            `sk_${KEY_ID}.${seed} extra`,
        ];
        for (const secret of malformed) {
            expect(() => parseSecret(secret)).toThrow(/Not a Pikoman API key secret/);
        }
        expect(() => parseSecret(undefined as any)).toThrow();
        expect(() => OfflineAuthenticator.fromSecret('sk_nope')).toThrow();
        expect(() => new Rest({app: 'app-test', apiKey: 'sk_nope'})).toThrow();
    });

    it('Should not put the secret in the error', () => {
        const secret = `sk_${KEY_ID}.${SEED.toString('base64url').slice(1)}`;
        try {
            parseSecret(secret);
            throw new Error('parsed');
        } catch (e) {
            expect((e as Error).message).not.toContain(secret.slice(22));
        }
    });
});

/** base64url SHA-256, made with Node's own crypto rather than the library's. */
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('base64url');
const POST = {method: 'POST', url: 'https://api.example/orders/created', body: '{"id":1042}'};

describe('Request tokens', () => {
    it('Should have the header and claims of KEYS.md and verify with the public key', async () => {
        const before = Math.floor(Date.now() / 1000);
        const token = await requestToken(SECRET, 'app-test', POST);
        const [header, payload] = token.split('.');
        expect(decode(header)).toEqual({alg: 'EdDSA', typ: 'JWT', kid: KEY_ID});
        const claims = decode(payload);
        expect(Object.keys(claims).sort()).toEqual(['bh', 'exp', 'htm', 'htu', 'iat', 'iss']);
        expect(claims.iss).toBe('app-test');
        expect(claims.iat).toBeGreaterThanOrEqual(before);
        expect(claims.exp - claims.iat).toBe(60);
        expect(REQUEST_TOKEN_LIFETIME).toBe(60);
        expect(claims.htm).toBe('POST');
        expect(claims.htu).toBe('/orders/created');
        expect(claims.bh).toBe(sha256('{"id":1042}'));
        expect(await verify(token)).toBe(true);
    });

    it('Should bind the method, the path with its query, and the exact body', async () => {
        const claims = async (request: SignedRequest) => decode((await requestToken(SECRET, 'app-test', request)).split('.')[1]);

        // Lower case is sent as upper case; a path alone works as well as a URL.
        expect((await claims({method: 'get', url: '/orders/stats'})).htm).toBe('GET');
        expect((await claims({method: 'GET', url: '/orders/stats'})).htu).toBe('/orders/stats');
        // The query string as sent; never the scheme, the host or a fragment.
        expect((await claims({method: 'GET', url: 'https://api.example:8443/orders/clients?limit=5&x=%20#top'})).htu).toBe('/orders/clients?limit=5&x=%20');
        // Node's fetch sends pathname + search, which leaves out an empty query: so is it signed.
        expect((await claims({method: 'GET', url: 'https://api.example/orders/stats?'})).htu).toBe('/orders/stats');
        expect((await claims({method: 'GET', url: '/orders/stats?#top'})).htu).toBe('/orders/stats');
        // A query is written as the URL parser writes it, as fetch sends it.
        expect((await claims({method: 'GET', url: "/orders/stats?q='a b'"})).htu).toBe('/orders/stats?q=%27a%20b%27');
        // The path as fetch writes it, encoded.
        expect((await claims({method: 'POST', url: 'https://api.example/orders/order shipped'})).htu).toBe('/orders/order%20shipped');

        // No body, an empty one and null all hash the empty string.
        const empty = sha256('');
        expect(empty).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU');
        for (const body of [undefined, null, '', new Uint8Array(0)]) {
            expect((await claims({method: 'DELETE', url: '/disconnect-all', body})).bh).toBe(empty);
        }
        // Text is hashed as UTF-8, bytes as they are, and one byte more is another hash.
        expect((await claims({...POST, body: '{"text":"hej då"}'})).bh).toBe(sha256(Buffer.from('{"text":"hej då"}', 'utf8')));
        expect((await claims({...POST, body: Buffer.from([1, 2, 3])})).bh).toBe(sha256(Buffer.from([1, 2, 3])));
        expect((await claims({...POST, body: '{"id":1042} '})).bh).not.toBe(sha256('{"id":1042}'));
    });

    it('Should refuse to sign without the request it is for', async () => {
        for (const request of [undefined, 300, 'POST /orders', {url: '/orders'}, {method: 'POST'}, {method: 'PO ST', url: '/a'}, {method: 'POST', url: ''}]) {
            await expect(requestToken(SECRET, 'app-test', request as any)).rejects.toThrow(/request|method|URL/);
            await expect(authorizationHeader(SECRET, 'app-test', request as any)).rejects.toThrow(/request|method|URL/);
        }
        await expect(requestToken(SECRET, 'app-test', {...POST, body: {id: 1} as any})).rejects.toThrow(/text or bytes/);
        await expect(requestToken(SECRET, '', POST)).rejects.toThrow(/app id/);
    });

    it('Should not verify after a change', async () => {
        const token = await requestToken(SECRET, 'app-test', POST);
        const [header, payload, signature] = token.split('.');
        const claims = decode(payload);
        for (const changed of [{iss: 'app-other'}, {htm: 'DELETE'}, {htu: '/orders/deleted'}, {bh: sha256('{"id":1}')}, {exp: claims.exp + 600}]) {
            const forged = Buffer.from(JSON.stringify({...claims, ...changed})).toString('base64url');
            expect(await verify(`${header}.${forged}.${signature}`)).toBe(false);
        }
    });

    it('Should refuse a key without its id, rather than sign a token without kid', async () => {
        const {key} = await importSecret(SECRET);
        await expect(requestToken({key}, 'app-test', POST)).rejects.toThrow(/id/);
        await expect(requestToken({key, keyId: ''}, 'app-test', POST)).rejects.toThrow(/id/);
        const token = await requestToken({key, keyId: KEY_ID}, 'app-test', POST);
        expect(decode(token.split('.')[0]).kid).toBe(KEY_ID);
    });

    it('Should make the Authorization header', async () => {
        const header = await authorizationHeader(SECRET, 'app-test', {method: 'GET', url: 'https://api.example/orders/stats'});
        expect(header).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
        expect(await verify(header.slice('Bearer '.length))).toBe(true);
        expect(decode(header.split('.')[1])).toMatchObject({htm: 'GET', htu: '/orders/stats', bh: sha256('')});
    });
});

describe('Join tokens with kid', () => {
    it('Should keep the old constructor and a header without kid', async () => {
        const token = await new OfflineAuthenticator({name: 'Anna'}, PKCS8_BASE64, 3).authenticate('c_1', 'presence-room');
        expect(decode(token.split('.')[0])).toEqual({alg: 'EdDSA', typ: 'JWT'});
        expect(await verify(token)).toBe(true);
    });

    it('Should put a signing key id in the header', async () => {
        const token = await new OfflineAuthenticator(null, PKCS8_BASE64, 0, 's_0123456789abcdef').authenticate('c_1', 'private-a');
        expect(decode(token.split('.')[0])).toEqual({alg: 'EdDSA', typ: 'JWT', kid: 's_0123456789abcdef'});
        expect(await verify(token)).toBe(true);
    });

    it('Should sign join tokens for whole seconds, at most 600', async () => {
        const {key} = await importSecret(SECRET);
        const before = Math.floor(Date.now() / 1000);
        const token = await authChannelWithKey('c_1', 'private-a', null, key, 0, 120.7, KEY_ID);
        const exp = decode(token.split('.')[1]).exp;
        expect(Number.isInteger(exp)).toBe(true);
        expect(exp - before).toBeGreaterThanOrEqual(120);
        expect(exp - before).toBeLessThanOrEqual(121);
        await expect(authChannelWithKey('c_1', 'private-a', null, key, 0, 601, KEY_ID)).rejects.toThrow(/600/);
        await expect(authChannelWithKey('c_1', 'private-a', null, key, 0, 0, KEY_ID)).rejects.toThrow();
        await expect(authChannelWithKey('c_1', 'private-a', null, key, 0, 600, KEY_ID)).resolves.toBeTruthy();
    });

    it('Should sign as a bot with an API key', async () => {
        const token = await OfflineAuthenticator.fromSecret(SECRET, {bot: 'berries'}, 3).authenticate('c_bot', 'presence-garden');
        const [header, payload] = token.split('.');
        expect(decode(header)).toEqual({alg: 'EdDSA', typ: 'JWT', kid: KEY_ID});
        expect(decode(payload)).toMatchObject({connection: 'c_bot', channel: 'presence-garden', access: 3, data: {bot: 'berries'}});
        expect(await verify(token)).toBe(true);
    });
});

describe('Rest', () => {
    const realFetch = (globalThis as any).fetch;
    afterEach(() => {
        (globalThis as any).fetch = realFetch;
    });

    it('Should publish with a bearer token made for that one request', async () => {
        const calls: any[] = [];
        (globalThis as any).fetch = async (url: string, init: any) => {
            calls.push({url, init});
            return {ok: true, status: 202, json: async () => ({})};
        };
        const rest = new Rest({app: 'app-test', apiKey: SECRET, address: 'https://api.example/'});
        await rest.publish('orders', 'order shipped', {id: 1042});
        await rest.publish('orders', 'again', null);
        expect(calls[0].url).toBe('https://api.example/orders/order%20shipped');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.body).toBe('{"id":1042}');
        const authorization = calls[0].init.headers.Authorization;
        const token = authorization.slice('Bearer '.length);
        expect(await verify(token)).toBe(true);
        const claims = decode(token.split('.')[1]);
        expect(claims).toMatchObject({iss: 'app-test', htm: 'POST', htu: '/orders/order%20shipped', bh: sha256('{"id":1042}')});
        expect(claims.exp - claims.iat).toBe(60);
        // The next request has a token of its own, for its own path and body.
        expect(decode(calls[1].init.headers.Authorization.split('.')[1])).toMatchObject({htu: '/orders/again', bh: sha256('null')});
    });

    it('Should publish to one member, and read the channel list and stats', async () => {
        const calls: any[] = [];
        let answer: any = {clients: 1};
        (globalThis as any).fetch = async (url: string, init: any) => {
            calls.push({url, init});
            return {ok: true, status: 200, json: async () => answer};
        };
        const rest = new Rest({app: 'app-test', apiKey: SECRET, address: 'https://api.example'});
        expect(await rest.publish('presence-room', 'missed', [1], {toUser: 'user 7'})).toBe(1);
        expect(calls[0].url).toBe('https://api.example/presence-room/missed?to_user=user%207');
        expect(decode(calls[0].init.headers.Authorization.split('.')[1]).htu).toBe('/presence-room/missed?to_user=user%207');
        await rest.publish('presence-room', 'missed', [1], {to: 'c_1'});
        expect(calls[1].url).toBe('https://api.example/presence-room/missed?to=c_1');
        await expect(rest.publish('room', 'e', 1, {to: 'c_1', toUser: '7'})).rejects.toThrow('not both');
        await expect(rest.publish('room', 'e', 1, {to: ''})).rejects.toThrow('1-128');

        answer = {channels: {'chat-1': {message_count: 4}}, next: 'chat-1'};
        const list = await rest.channels({prefix: 'chat-', info: ['message_count', 'user_count'], limit: 1});
        expect(list.next).toBe('chat-1');
        expect(calls[2].url).toBe('https://api.example/channels?prefix=chat-&info=message_count%2Cuser_count&limit=1');
        expect(calls[2].init.method).toBe('GET');
        const claims = decode(calls[2].init.headers.Authorization.split('.')[1]);
        expect(claims).toMatchObject({htm: 'GET', htu: '/channels?prefix=chat-&info=message_count%2Cuser_count&limit=1', bh: sha256('')});
        answer = {clients: 3, message_count: 9};
        expect(await rest.stats('chat-1')).toEqual({clients: 3, message_count: 9});
        expect(calls[3].url).toBe('https://api.example/chat-1/stats');
    });

    it('Should never reuse a token, and not try again after a 401', async () => {
        // The clock moves a second per request, as the same request a second later must get a new token.
        const clock = jest.spyOn(Date, 'now');
        let now = 1_800_000_000_000;
        clock.mockImplementation(() => now);
        const authorizations: string[] = [];
        let statuses: number[] = [];
        (globalThis as any).fetch = async (_url: string, init: any) => {
            authorizations.push(init.headers.Authorization);
            now += 1000;
            const status = statuses.shift() as number;
            return {ok: status < 300, status, json: async () => ({error: 'Unauthorized'})};
        };
        try {
            const rest = new Rest({app: 'app-test', apiKey: SECRET});
            statuses = [202, 202];
            await rest.publish('orders', 'x', 1);
            await rest.publish('orders', 'x', 1);
            expect(authorizations[1]).not.toBe(authorizations[0]);
            expect(decode(authorizations[1].split('.')[1]).iat).toBe(decode(authorizations[0].split('.')[1]).iat + 1);

            // A fresh token was refused: trying again would only be refused again.
            statuses = [401];
            await expect(rest.publish('orders', 'x', 1)).rejects.toThrow('401');
            statuses = [403];
            await expect(rest.publish('orders', 'x', 1)).rejects.toThrow('403');
            expect(authorizations).toHaveLength(4);
            expect(new Set(authorizations).size).toBe(4);
        } finally {
            clock.mockRestore();
        }
    });

    it('Should refuse to publish an event named client-…, which only members send', async () => {
        const calls: any[] = [];
        (globalThis as any).fetch = async (...args: any[]) => {
            calls.push(args);
            return {ok: true, status: 202, json: async () => ({})};
        };
        const rest = new Rest({app: 'app-test', apiKey: SECRET});
        await expect(rest.publish('orders', 'client-shipped', 1)).rejects.toThrow(/client-/);
        expect(calls).toEqual([]);
        await rest.publish('orders', 'shipped-to-client', 1);
        expect(calls).toHaveLength(1);
    });

    it('Should refuse names that are empty, "." or "..", and send every other name as one path segment', async () => {
        const urls: string[] = [];
        (globalThis as any).fetch = async (url: string) => {
            urls.push(url);
            return {ok: true, status: 202, json: async () => ({})};
        };
        const rest = new Rest({app: 'app-test', apiKey: SECRET, address: 'https://api.example'});
        // The URL parser reads "." and ".." as steps: POST /../mass_events would be POST /mass_events.
        const refused = [['..', 'mass_events'], ['.', 'x'], ['', 'x'], ['orders', '..'], ['orders', '.'], ['orders', ''], [undefined, 'x'], ['orders', null]];
        for (const [channel, event] of refused) {
            await expect(rest.publish(channel as any, event as any, 1)).rejects.toThrow(/name \(it cannot be empty/);
        }
        expect(urls).toEqual([]);

        // Anything else is percent-encoded: a slash, a percent sign or three dots stay in their segment.
        await rest.publish('...', 'a/b', 1);
        await rest.publish('orders', '%2e%2e', 1);
        expect(urls).toEqual(['https://api.example/.../a%2Fb', 'https://api.example/orders/%252e%252e']);
        for (const url of urls) {
            expect(new URL(url).pathname.split('/')).toHaveLength(3);
        }
    });

    it('Should refuse data that has no JSON form', async () => {
        const calls: any[] = [];
        (globalThis as any).fetch = async (...args: any[]) => {
            calls.push(args);
            return {ok: true, status: 202, json: async () => ({})};
        };
        const rest = new Rest({app: 'app-test', apiKey: SECRET});
        await expect(rest.publish('orders', 'x', () => 1)).rejects.toThrow(/no JSON/);
        await expect(rest.publish('orders', 'x', Symbol('s'))).rejects.toThrow(/no JSON/);
        expect(calls).toEqual([]);
        await rest.publish('orders', 'x', undefined);
        expect(calls[0][1].body).toBe('null');
    });

    it('Should refuse to run in a browser, where the key would be anyone\'s', () => {
        const g = globalThis as any;
        g.window = {};
        g.document = {};
        try {
            expect(() => new Rest({app: 'app-test', apiKey: SECRET})).toThrow(/never in a browser/);
            expect(() => OfflineAuthenticator.fromSecret(SECRET)).toThrow(/never in a browser/);
            expect(() => new MasterKeyAuthenticator({authenticate: async () => 't'}, Buffer.alloc(32).toString('base64'))).toThrow(/never in a browser/);
            // A signing key puts the key in the page: refused, unless the page says it means it
            // (a playground where the visitor types in a key) or is served from localhost.
            expect(() => new OfflineAuthenticator(null, PKCS8_BASE64, 0)).toThrow(/allowInBrowser/);
            expect(() => new OfflineAuthenticator(null, PKCS8_BASE64, 0, undefined, {allowInBrowser: true})).not.toThrow();
            g.location = {hostname: 'localhost'};
            expect(() => new OfflineAuthenticator(null, PKCS8_BASE64, 0)).not.toThrow();
        } finally {
            delete g.window;
            delete g.document;
            delete g.location;
        }
        expect(() => new Rest({app: 'app-test', apiKey: SECRET})).not.toThrow();
    });

    it('Should use next-api.pikoman.se by default', async () => {
        const urls: string[] = [];
        (globalThis as any).fetch = async (url: string) => {
            urls.push(url);
            return {ok: true, status: 202, json: async () => ({})};
        };
        await new Rest({app: 'app-test', apiKey: SECRET}).publish('orders', 'x', 1);
        expect(urls).toEqual(['https://next-api.pikoman.se/orders/x']);
    });

    it('Should say why a publish failed', async () => {
        (globalThis as any).fetch = async () => ({ok: false, status: 403, json: async () => ({error: 'Not allowed'})});
        const rest = new Rest({app: 'app-test', apiKey: SECRET});
        await expect(rest.publish('orders', 'x', 1)).rejects.toThrow('403 Not allowed');
    });

    it('Should encrypt for encrypted channels, and refuse without a master key', async () => {
        const bodies: any[] = [];
        (globalThis as any).fetch = async (_url: string, init: any) => {
            bodies.push(JSON.parse(init.body));
            return {ok: true, status: 202, json: async () => ({})};
        };
        const master = Buffer.alloc(32, 1).toString('base64');
        await new Rest({app: 'app-test', apiKey: SECRET, encryptionKey: master}).publish('private-encrypted-room', 'msg', {text: 'hi'});
        expect(Object.keys(bodies[0]).sort()).toEqual(['ciphertext', 'nonce']);
        // Published over HTTP: authenticated as the server, not as a member.
        const key = await channelKey(master, 'app-test', 'private-encrypted-room');
        expect(await decryptEvent('private-encrypted-room', 'msg', bodies[0], key, 'server')).toEqual({text: 'hi'});
        await expect(decryptEvent('private-encrypted-room', 'msg', bodies[0], key, 'client')).rejects.toThrow();
        await expect(new Rest({app: 'app-test', apiKey: SECRET}).publish('private-encrypted-room', 'msg', 1)).rejects.toThrow(/master key/);
    });
});
