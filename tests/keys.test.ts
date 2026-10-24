/**
 * @jest-environment node
 */
import {createPrivateKey, createPublicKey, webcrypto} from 'crypto';
import {
    MasterKeyAuthenticator,
    OfflineAuthenticator,
    importSecret,
    parseSecret,
    requestToken,
    authorizationHeader,
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

describe('Request tokens', () => {
    it('Should have the header and claims of KEYS.md and verify with the public key', async () => {
        const before = Math.floor(Date.now() / 1000);
        const token = await requestToken(SECRET, 'app-test');
        const [header, payload] = token.split('.');
        expect(decode(header)).toEqual({alg: 'EdDSA', typ: 'JWT', kid: KEY_ID});
        const claims = decode(payload);
        expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'iss']);
        expect(claims.iss).toBe('app-test');
        expect(claims.iat).toBeGreaterThanOrEqual(before);
        expect(claims.exp - claims.iat).toBe(300);
        expect(await verify(token)).toBe(true);
    });

    it('Should not verify after a change', async () => {
        const token = await requestToken(SECRET, 'app-test');
        const [header, , signature] = token.split('.');
        const forged = Buffer.from(JSON.stringify({iss: 'app-other', iat: 1, exp: 2})).toString('base64url');
        expect(await verify(`${header}.${forged}.${signature}`)).toBe(false);
    });

    it('Should live at most ten minutes', async () => {
        const token = await requestToken(SECRET, 'app-test', 600);
        const claims = decode(token.split('.')[1]);
        expect(claims.exp - claims.iat).toBe(600);
        await expect(requestToken(SECRET, 'app-test', 601)).rejects.toThrow();
        await expect(requestToken(SECRET, 'app-test', 0)).rejects.toThrow();
        await expect(requestToken(SECRET, '')).rejects.toThrow();
    });

    it('Should live whole seconds only', async () => {
        const claims = decode((await requestToken(SECRET, 'app-test', 299.9)).split('.')[1]);
        expect(claims.exp - claims.iat).toBe(299);
        expect(Number.isInteger(claims.exp)).toBe(true);
        await expect(requestToken(SECRET, 'app-test', 600.5)).resolves.toBeTruthy();
        await expect(requestToken(SECRET, 'app-test', 0.9)).rejects.toThrow();
        await expect(requestToken(SECRET, 'app-test', NaN)).rejects.toThrow();
    });

    it('Should refuse a key without its id, rather than sign a token without kid', async () => {
        const {key} = await importSecret(SECRET);
        await expect(requestToken({key}, 'app-test')).rejects.toThrow(/id/);
        await expect(requestToken({key, keyId: ''}, 'app-test')).rejects.toThrow(/id/);
        const token = await requestToken({key, keyId: KEY_ID}, 'app-test');
        expect(decode(token.split('.')[0]).kid).toBe(KEY_ID);
    });

    it('Should make the Authorization header', async () => {
        const header = await authorizationHeader(SECRET, 'app-test');
        expect(header).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
        expect(await verify(header.slice('Bearer '.length))).toBe(true);
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

    it('Should publish with a bearer token, and reuse it', async () => {
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
        expect(await verify(authorization.slice('Bearer '.length))).toBe(true);
        expect(calls[1].init.headers.Authorization).toBe(authorization);
    });

    it('Should drop a token refused with 401 and try once more with a fresh one', async () => {
        // Every request moves the clock one second: well inside the four minutes a token is
        // reused, so a token that was kept would be sent again, and a fresh one has a later iat.
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
            statuses = [401, 202];
            await rest.publish('orders', 'x', 1);
            expect(authorizations).toHaveLength(2);
            expect(authorizations[1]).not.toBe(authorizations[0]);

            // A token that worked is reused.
            statuses = [202];
            await rest.publish('orders', 'x', 1);
            expect(authorizations[2]).toBe(authorizations[1]);

            // Only one retry: a second 401 is the answer, and that token is not kept either.
            statuses = [401, 401];
            await expect(rest.publish('orders', 'x', 1)).rejects.toThrow('401');
            expect(authorizations).toHaveLength(5);
            expect(authorizations[3]).toBe(authorizations[2]);
            expect(authorizations[4]).not.toBe(authorizations[3]);
            statuses = [202];
            await rest.publish('orders', 'x', 1);
            expect(authorizations[5]).not.toBe(authorizations[4]);

            // Other refusals are not retried.
            statuses = [403];
            await expect(rest.publish('orders', 'x', 1)).rejects.toThrow('403');
            expect(authorizations).toHaveLength(7);
        } finally {
            clock.mockRestore();
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
            // A signing key for local experiments still works there.
            expect(() => new OfflineAuthenticator(null, PKCS8_BASE64, 0)).not.toThrow();
        } finally {
            delete g.window;
            delete g.document;
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
        const key = await channelKey(master, 'private-encrypted-room');
        expect(await decryptEvent('private-encrypted-room', 'msg', bodies[0], key, 'server')).toEqual({text: 'hi'});
        await expect(decryptEvent('private-encrypted-room', 'msg', bodies[0], key, 'client')).rejects.toThrow();
        await expect(new Rest({app: 'app-test', apiKey: SECRET}).publish('private-encrypted-room', 'msg', 1)).rejects.toThrow(/master key/);
    });
});
