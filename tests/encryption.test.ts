/**
 * @jest-environment node
 */
import {createCipheriv, createDecipheriv, randomBytes} from 'crypto';
import {channelKey, decryptEvent, Direction, encryptEvent, importChannelKey} from '../src';
import {installWebGlobals} from './web_globals';

// Test keys only. The master key is the bytes 0, 1, …, 31.
const MASTER = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
// HMAC-SHA256(MASTER, "private-encrypted-test"), computed once with Node's crypto.
const TEST_CHANNEL_KEY = 'BXZ3eZVE7qg3gVuvKUOimdghY3hQ1Gm0h9uULbkIQb0=';
const CHANNEL = 'private-encrypted-test';

beforeAll(installWebGlobals);

describe('Channel keys', () => {
    it('Should be HMAC-SHA256 of the channel name', async () => {
        expect(await channelKey(MASTER, CHANNEL)).toBe(TEST_CHANNEL_KEY);
        expect(await channelKey(new Uint8Array(Buffer.from(MASTER, 'base64')), CHANNEL)).toBe(TEST_CHANNEL_KEY);
        expect(await channelKey(MASTER, 'private-encrypted-other')).not.toBe(TEST_CHANNEL_KEY);
    });

    it('Should refuse master and channel keys that are not 32 bytes', async () => {
        await expect(channelKey(Buffer.alloc(16).toString('base64'), CHANNEL)).rejects.toThrow();
        await expect(channelKey('not base64!', CHANNEL)).rejects.toThrow();
        await expect(importChannelKey(Buffer.alloc(31).toString('base64'))).rejects.toThrow();
    });
});

describe('Encrypted events', () => {
    const data = {text: 'hej', n: 3, list: [1, 'å']};

    it('Should round trip', async () => {
        const encrypted = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        expect(Object.keys(encrypted).sort()).toEqual(['ciphertext', 'nonce']);
        expect(Buffer.from(encrypted.nonce, 'base64')).toHaveLength(12);
        // The plaintext's length plus the 16-byte tag.
        expect(Buffer.from(encrypted.ciphertext, 'base64')).toHaveLength(Buffer.byteLength(JSON.stringify(data)) + 16);
        expect(await decryptEvent(CHANNEL, 'message', encrypted, TEST_CHANNEL_KEY)).toEqual(data);
        // With an imported key too, and no data.
        const key = await importChannelKey(TEST_CHANNEL_KEY);
        expect(await decryptEvent(CHANNEL, 'e', await encryptEvent(CHANNEL, 'e', undefined, key), key)).toBeNull();
    });

    it('Should use a fresh nonce each time', async () => {
        const first = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        const second = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        expect(first.nonce).not.toBe(second.nonce);
        expect(first.ciphertext).not.toBe(second.ciphertext);
    });

    it('Should match AES-256-GCM as Node does it, both ways', async () => {
        const key = Buffer.from(TEST_CHANNEL_KEY, 'base64');
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(Buffer.from(`server\n${CHANNEL}\nmessage`));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
        expect(await decryptEvent(CHANNEL, 'message', {nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64')}, TEST_CHANNEL_KEY)).toEqual(data);

        const ours = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        const bytes = Buffer.from(ours.ciphertext, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ours.nonce, 'base64'));
        decipher.setAAD(Buffer.from(`server\n${CHANNEL}\nmessage`));
        decipher.setAuthTag(bytes.subarray(bytes.length - 16));
        const plaintext = Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]);
        expect(JSON.parse(plaintext.toString('utf8'))).toEqual(data);
    });

    it('Should fail with the wrong channel or event (AAD)', async () => {
        const encrypted = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        await expect(decryptEvent('private-encrypted-other', 'message', encrypted, TEST_CHANNEL_KEY)).rejects.toThrow();
        await expect(decryptEvent(CHANNEL, 'other', encrypted, TEST_CHANNEL_KEY)).rejects.toThrow();
    });

    it('Should fail in the other direction (AAD)', async () => {
        const fromServer = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY, 'server');
        const fromClient = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY, 'client');
        expect(await decryptEvent(CHANNEL, 'message', fromServer, TEST_CHANNEL_KEY, 'server')).toEqual(data);
        expect(await decryptEvent(CHANNEL, 'message', fromClient, TEST_CHANNEL_KEY, 'client')).toEqual(data);
        await expect(decryptEvent(CHANNEL, 'message', fromServer, TEST_CHANNEL_KEY, 'client')).rejects.toThrow();
        await expect(decryptEvent(CHANNEL, 'message', fromClient, TEST_CHANNEL_KEY, 'server')).rejects.toThrow();
        // The default is server, as for a publish over HTTP.
        expect(await decryptEvent(CHANNEL, 'message', fromServer, TEST_CHANNEL_KEY)).toEqual(data);
        await expect(decryptEvent(CHANNEL, 'message', fromClient, TEST_CHANNEL_KEY)).rejects.toThrow();
        await expect(encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY, 'both' as any)).rejects.toThrow(/direction/);
    });

    it('Should refuse data that has no JSON form', async () => {
        for (const bad of [() => 1, Symbol('s')]) {
            await expect(encryptEvent(CHANNEL, 'message', bad, TEST_CHANNEL_KEY)).rejects.toThrow(/no JSON/);
        }
        // undefined is sent as null, as in a plain channel.
        expect(await decryptEvent(CHANNEL, 'm', await encryptEvent(CHANNEL, 'm', undefined, TEST_CHANNEL_KEY), TEST_CHANNEL_KEY)).toBeNull();
    });

    it('Should fail with the wrong key', async () => {
        const encrypted = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        const otherKey = await channelKey(MASTER, 'private-encrypted-other');
        await expect(decryptEvent(CHANNEL, 'message', encrypted, otherKey)).rejects.toThrow();
    });

    it('Should fail when the ciphertext, tag or nonce is changed', async () => {
        const encrypted = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        const bytes = Buffer.from(encrypted.ciphertext, 'base64');
        for (const index of [0, bytes.length - 1]) { // the first byte of text, the last of the tag
            const tampered = Buffer.from(bytes);
            tampered[index] ^= 1;
            await expect(decryptEvent(CHANNEL, 'message', {...encrypted, ciphertext: tampered.toString('base64')}, TEST_CHANNEL_KEY)).rejects.toThrow();
        }
        const nonce = Buffer.from(encrypted.nonce, 'base64');
        nonce[0] ^= 1;
        await expect(decryptEvent(CHANNEL, 'message', {...encrypted, nonce: nonce.toString('base64')}, TEST_CHANNEL_KEY)).rejects.toThrow();
        await expect(decryptEvent(CHANNEL, 'message', {...encrypted, ciphertext: bytes.subarray(0, bytes.length - 1).toString('base64')}, TEST_CHANNEL_KEY)).rejects.toThrow();
    });

    it('Should read the fixed vectors', async () => {
        // Made once with Node's crypto: the channel key above, the nonce 0, 1, …, 11, and the AAD
        // `<direction>\n<channel>\n<event>`. Other libraries (the Rust crate) can check the same bytes.
        const nonce = 'AAECAwQFBgcICQoL';
        const vectors: [Direction, string, string, any][] = [
            ['server', 'message', '+OUwyZTgsN9LZaMOU0G+DcstVR88BuFRU9459MuI', {text: 'hej'}],
            ['client', 'message', '+OUwyZTgsN9LZaMOU0Ga3RxDalEHfSA3ra1/b/7D', {text: 'hej'}],
            ['server', '', '7bIowIH5W+5XA7DldbXSv8oT/a0=', null],
        ];
        for (const [direction, event, ciphertext, plain] of vectors) {
            expect(await decryptEvent(CHANNEL, event, {nonce, ciphertext}, TEST_CHANNEL_KEY, direction)).toEqual(plain);
            const other: Direction = direction === 'server' ? 'client' : 'server';
            await expect(decryptEvent(CHANNEL, event, {nonce, ciphertext}, TEST_CHANNEL_KEY, other)).rejects.toThrow();
        }
    });

    it('Should fail on data that is not {nonce, ciphertext}', async () => {
        for (const bad of [null, 'text', 5, {}, {nonce: 'AAAAAAAAAAAAAAAA'}, {nonce: 1, ciphertext: 'AA=='}, {nonce: 'AAAA', ciphertext: 'AAAA'}]) {
            await expect(decryptEvent(CHANNEL, 'message', bad, TEST_CHANNEL_KEY)).rejects.toThrow();
        }
    });
});
