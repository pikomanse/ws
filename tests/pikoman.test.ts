/**
 * @jest-environment node
 */
import {webcrypto} from 'crypto';
import {TextEncoder} from 'util';
import {OfflineAuthenticator} from '../src';
import {importSigningKey, signToken} from '../src/authenticators/offline_authenticator';

// A test key only (the same seed as the server's tests), never used for a real app.
const TEST_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH
-----END PRIVATE KEY-----`;

function decode(part: string): any {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Browsers have these built in; Jest 26's node environment does not.
beforeAll(() => {
    const g = globalThis as any;
    g.crypto = g.crypto ?? webcrypto;
    g.TextEncoder = g.TextEncoder ?? TextEncoder;
    g.atob = g.atob ?? ((text: string) => Buffer.from(text, 'base64').toString('binary'));
    g.btoa = g.btoa ?? ((text: string) => Buffer.from(text, 'binary').toString('base64'));
});

describe(`OfflineAuthenticator`, () => {
    it(`Should sign a token the server can verify`, async () => {
        const authenticator = new OfflineAuthenticator({name: 'Anna'}, TEST_PEM, 3);
        const token = await authenticator.authenticate('c_1', 'presence-room');
        const [header, payload, signature] = token.split('.');

        expect(decode(header)).toEqual({alg: 'EdDSA', typ: 'JWT'});
        const claims = decode(payload);
        expect(claims).toMatchObject({connection: 'c_1', channel: 'presence-room', access: 3, data: {name: 'Anna'}});
        expect(claims.exp).toBeGreaterThan(Date.now() / 1000);

        const publicKey = webcrypto.subtle.importKey(
            'raw',
            // Public key for the seed of sevens, from the server's tests.
            Buffer.from((await exportPublicKey()), 'base64'),
            {name: 'Ed25519'},
            false,
            ['verify'],
        );
        const valid = await webcrypto.subtle.verify(
            {name: 'Ed25519'},
            await publicKey,
            Buffer.from(signature, 'base64url'),
            new TextEncoder().encode(`${header}.${payload}`),
        );
        expect(valid).toBe(true);
    });

    it(`Should give different signatures for different payloads`, async () => {
        const key = await importSigningKey(TEST_PEM);
        const first = await signToken({a: 1}, key);
        const second = await signToken({a: 2}, key);
        expect(first.split('.')[2]).not.toEqual(second.split('.')[2]);
    });
});

async function exportPublicKey(): Promise<string> {
    const {createPrivateKey, createPublicKey} = await import('crypto');
    const publicKey = createPublicKey(createPrivateKey(TEST_PEM));
    // The last 32 bytes of the SPKI DER are the raw key.
    const der = publicKey.export({type: 'spki', format: 'der'}) as Buffer;
    return der.subarray(der.length - 32).toString('base64');
}
