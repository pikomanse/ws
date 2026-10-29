/**
 * @jest-environment node
 */
import {inspect} from 'util';
import {channelKey, importMasterKey, EncryptedChannelAuthenticator, TokenSigner, Rest} from '../src';
import {installWebGlobals} from './web_globals';

// Test keys only.
const SEED = Buffer.alloc(32, 7);
const KEY_ID = 'k_3f9a1c0e5b7d2468';
const SECRET = `sk_${KEY_ID}.${SEED.toString('base64url')}`;
const MASTER = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const TEST_CHANNEL_KEY = 'tYiq/FY0unmbT9GVQeR6NNCdJhPvlbl6+70+E0B0cS0=';

const g = globalThis as any;
const realFetch = g.fetch;
beforeAll(installWebGlobals);
afterEach(() => {
    g.fetch = realFetch;
});

/** Every spelling of a secret that could show up in a dump. */
function spellings(): string[] {
    const master = Buffer.from(MASTER, 'base64');
    return [
        SECRET,
        SEED.toString('base64url'),
        SEED.toString('base64'),
        SEED.toString('hex'),
        MASTER,
        master.toString('base64url'),
        master.toString('hex'),
        // Bytes as util.inspect prints a Uint8Array or a Buffer.
        Array.from(master).slice(0, 8).join(', '),
        Array.from(SEED).slice(0, 8).join(', '),
        '07 07 07 07',
        '00 01 02 03',
    ];
}

function expectNoSecret(dump: string, extra: string[] = []) {
    for (const secret of [...spellings(), ...extra]) {
        expect(dump).not.toContain(secret);
    }
}

describe('Secrets stay out of sight', () => {
    it('Rest: not in JSON.stringify or util.inspect, also after a signed request', async () => {
        let authorization = '';
        g.fetch = async (_url: string, init: any) => {
            authorization = init.headers.Authorization;
            return {ok: true, status: 202, json: async () => ({})};
        };
        const rest = new Rest({app: 'app-test', apiKey: SECRET, encryptionKey: MASTER, address: 'https://api.example'});
        await rest.publish('private-encrypted-room', 'msg', {text: 'hi'});
        const token = authorization.slice('Bearer '.length);
        expect(token.split('.')).toHaveLength(3);
        const dumps = [JSON.stringify(rest), inspect(rest, {showHidden: true, depth: Infinity}), String(rest), JSON.stringify({...rest}), inspect({...rest})];
        for (const dump of dumps) {
            expectNoSecret(dump, [token, token.split('.')[2]]);
        }
        expect(JSON.parse(JSON.stringify(rest))).toEqual({app: 'app-test', address: 'https://api.example', apiKey: '[hidden]', encryptionKey: '[hidden]'});
        expect(inspect(rest)).toContain('[hidden]');
        expect(Object.keys(rest).sort()).toEqual(['address', 'app']);
    });

    it('TokenSigner.fromSecret: not the seed', async () => {
        const auth = TokenSigner.fromSecret(SECRET, {name: 'Bot'}, 3);
        await auth.authenticate('c_1', 'private-a');
        for (const dump of [JSON.stringify(auth), inspect(auth, {showHidden: true, depth: Infinity}), JSON.stringify({...auth}), inspect({...auth}, {showHidden: true, depth: Infinity})]) {
            expectNoSecret(dump);
        }
        expect(inspect(auth)).toContain(KEY_ID);
    });

    it('EncryptedChannelAuthenticator: not the master key, as base64 or bytes', async () => {
        for (const master of [MASTER, new Uint8Array(Buffer.from(MASTER, 'base64'))]) {
            const auth = new EncryptedChannelAuthenticator(TokenSigner.fromSecret(SECRET), master);
            const answer = await auth.authenticate('c_1', 'private-encrypted-test', {app: 'app-test'});
            expect(answer).toMatchObject({channel_key: TEST_CHANNEL_KEY});
            for (const dump of [JSON.stringify(auth), inspect(auth, {showHidden: true, depth: Infinity}), JSON.stringify({...auth}), inspect({...auth}, {showHidden: true, depth: Infinity})]) {
                expectNoSecret(dump);
            }
        }
        // A wrong length is still refused at once.
        expect(() => new EncryptedChannelAuthenticator(TokenSigner.fromSecret(SECRET), Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
    });

    it('The master key imports as a non-extractable HMAC key that gives the same channel keys', async () => {
        const key = await importMasterKey(MASTER);
        expect(key.extractable).toBe(false);
        expect(key.algorithm.name).toBe('HMAC');
        expect(key.usages).toEqual(['sign']);
        expect(await channelKey(key, 'app-test', 'private-encrypted-test')).toBe(TEST_CHANNEL_KEY);
        await expect(importMasterKey(Buffer.alloc(31).toString('base64'))).rejects.toThrow(/32 bytes/);
        // Bytes the caller passed are left as they were.
        const bytes = new Uint8Array(Buffer.from(MASTER, 'base64'));
        await importMasterKey(bytes);
        expect(Buffer.from(bytes).toString('base64')).toBe(MASTER);
    });
});
