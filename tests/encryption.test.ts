/**
 * @jest-environment node
 */
import {createCipheriv, createDecipheriv, randomBytes} from 'crypto';
import {channelKey, decryptEvent, encryptEvent, importChannelKey} from '../src';
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
        cipher.setAAD(Buffer.from(`${CHANNEL}\nmessage`));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
        expect(await decryptEvent(CHANNEL, 'message', {nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64')}, TEST_CHANNEL_KEY)).toEqual(data);

        const ours = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        const bytes = Buffer.from(ours.ciphertext, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ours.nonce, 'base64'));
        decipher.setAAD(Buffer.from(`${CHANNEL}\nmessage`));
        decipher.setAuthTag(bytes.subarray(bytes.length - 16));
        const plaintext = Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]);
        expect(JSON.parse(plaintext.toString('utf8'))).toEqual(data);
    });

    it('Should fail with the wrong channel or event (AAD)', async () => {
        const encrypted = await encryptEvent(CHANNEL, 'message', data, TEST_CHANNEL_KEY);
        await expect(decryptEvent('private-encrypted-other', 'message', encrypted, TEST_CHANNEL_KEY)).rejects.toThrow();
        await expect(decryptEvent(CHANNEL, 'other', encrypted, TEST_CHANNEL_KEY)).rejects.toThrow();
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

    it('Should fail on data that is not {nonce, ciphertext}', async () => {
        for (const bad of [null, 'text', 5, {}, {nonce: 'AAAAAAAAAAAAAAAA'}, {nonce: 1, ciphertext: 'AA=='}, {nonce: 'AAAA', ciphertext: 'AAAA'}]) {
            await expect(decryptEvent(CHANNEL, 'message', bad, TEST_CHANNEL_KEY)).rejects.toThrow();
        }
    });
});
