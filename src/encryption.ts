/**
 * End-to-end encrypted channels, `private-encrypted-…` (ENCRYPTION.md in the Pikoman 2.0 workspace).
 *
 * - Master key: 32 random bytes kept by the app's backend (`PIKOMAN_ENCRYPTION_KEY`, base64).
 *   Never sent to Pikoman, never to a browser.
 * - Channel key: HMAC-SHA256(master key, channel name), 32 bytes. What a client gets.
 * - An event's data on the wire: `{"nonce": "<base64 12 bytes>", "ciphertext": "<base64>"}`,
 *   AES-256-GCM over the UTF-8 JSON of the real data, with the tag appended, and the UTF-8 bytes
 *   of `<channel>\n<event>` as additional authenticated data.
 */
import {fromBase64, fromUtf8, keyBytes, randomBytes, subtle, toBase64, utf8} from './encoding';

export const ENCRYPTED_PREFIX = 'private-encrypted-';

export function isEncryptedChannel(channel: string): boolean {
    return channel.startsWith(ENCRYPTED_PREFIX);
}

/** What an event's data in an encrypted channel looks like on the wire. */
export interface EncryptedData {
    nonce: string;
    ciphertext: string;
}

/** A channel key as base64 text, raw bytes, or an AES-GCM CryptoKey from `importChannelKey`. */
export type ChannelKey = string | Uint8Array | CryptoKey;

function isCryptoKey(key: any): key is CryptoKey {
    return typeof key === 'object' && key !== null && !(key instanceof Uint8Array) && 'algorithm' in key && 'type' in key;
}

/**
 * The channel key for one channel, as base64 (what a token endpoint answers in `channel_key`).
 * `masterKey` is the app's 32-byte master key, base64 or bytes.
 */
export async function channelKey(masterKey: string | Uint8Array, channel: string): Promise<string> {
    const master = keyBytes(masterKey);
    if (master.length !== 32) {
        throw new Error('The master key is 32 bytes');
    }
    const hmac = await subtle().importKey('raw', master, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
    return toBase64(new Uint8Array(await subtle().sign('HMAC', hmac, utf8(channel))));
}

/** Imports a channel key for AES-256-GCM. */
export async function importChannelKey(key: ChannelKey): Promise<CryptoKey> {
    if (isCryptoKey(key)) {
        return key;
    }
    const bytes = keyBytes(key);
    if (bytes.length !== 32) {
        throw new Error('A channel key is 32 bytes');
    }
    return subtle().importKey('raw', bytes, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

const additionalData = (channel: string, event: string) => utf8(`${channel}\n${event}`);

/** Encrypts an event's data for an encrypted channel. A fresh random nonce every time. */
export async function encryptEvent(channel: string, event: string, data: any, key: ChannelKey): Promise<EncryptedData> {
    const nonce = randomBytes(12);
    const ciphertext = await subtle().encrypt(
        {name: 'AES-GCM', iv: nonce, additionalData: additionalData(channel, event), tagLength: 128},
        await importChannelKey(key),
        utf8(JSON.stringify(data === undefined ? null : data)),
    );
    return {nonce: toBase64(nonce), ciphertext: toBase64(new Uint8Array(ciphertext))};
}

/**
 * Decrypts an event's data from an encrypted channel. Throws if it is not `{nonce, ciphertext}`,
 * or was made with another key, for another channel or event, or changed on the way.
 */
export async function decryptEvent(channel: string, event: string, data: any, key: ChannelKey): Promise<any> {
    if (typeof data !== 'object' || data === null || typeof data.nonce !== 'string' || typeof data.ciphertext !== 'string') {
        throw new Error('Not encrypted data');
    }
    const nonce = fromBase64(data.nonce);
    if (nonce.length !== 12) {
        throw new Error('The nonce is 12 bytes');
    }
    const plaintext = await subtle().decrypt(
        {name: 'AES-GCM', iv: nonce, additionalData: additionalData(channel, event), tagLength: 128},
        await importChannelKey(key),
        fromBase64(data.ciphertext),
    );
    return JSON.parse(fromUtf8(plaintext));
}
