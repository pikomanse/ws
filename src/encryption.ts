/**
 * End-to-end encrypted channels, `private-encrypted-…` (ENCRYPTION.md in the Pikoman 2.0 workspace).
 *
 * - Master key: 32 random bytes kept by the app's backend (`PIKOMAN_ENCRYPTION_KEY`, base64).
 *   Never sent to Pikoman, never to a browser.
 * - Channel key: HMAC-SHA256(master key, channel name), 32 bytes. What a client gets.
 * - An event's data on the wire: `{"nonce": "<base64 12 bytes>", "ciphertext": "<base64>"}`,
 *   AES-256-GCM over the UTF-8 JSON of the real data, with the tag appended, and the UTF-8 bytes
 *   of `<direction>\n<channel>\n<event>` as additional authenticated data. The direction is
 *   `server` for what the app's backend publishes over HTTP and `client` for client events between
 *   members, so neither can be passed off as the other. An event without a name uses "".
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

/**
 * Who made an event: `server` for what the app's backend publishes over the HTTP API (`Rest`,
 * `publish`), `client` for client events that members send each other (`channel.send`).
 */
export type Direction = 'server' | 'client';

function additionalData(direction: Direction, channel: string, event: string): Uint8Array {
    if (direction !== 'server' && direction !== 'client') {
        throw new Error('The direction is "server" or "client"');
    }
    return utf8(`${direction}\n${channel}\n${event ?? ''}`);
}

/**
 * The JSON text of an event's data. `undefined` is sent as `null`; data that has no JSON (a
 * function, a symbol) is refused rather than sent as nothing.
 */
export function eventJson(data: any): string {
    if (data === undefined) {
        return 'null';
    }
    const json = JSON.stringify(data);
    if (json === undefined) {
        throw new Error(`Pikoman: event data of type ${typeof data} has no JSON form`);
    }
    return json;
}

/**
 * Encrypts an event's data for an encrypted channel. A fresh random nonce every time.
 * `direction` is `server` (the default) for a publish over the HTTP API, `client` for a client event.
 */
export async function encryptEvent(channel: string, event: string, data: any, key: ChannelKey, direction: Direction = 'server'): Promise<EncryptedData> {
    const nonce = randomBytes(12);
    const ciphertext = await subtle().encrypt(
        {name: 'AES-GCM', iv: nonce, additionalData: additionalData(direction, channel, event), tagLength: 128},
        await importChannelKey(key),
        utf8(eventJson(data)),
    );
    return {nonce: toBase64(nonce), ciphertext: toBase64(new Uint8Array(ciphertext))};
}

/**
 * Decrypts an event's data from an encrypted channel. Throws if it is not `{nonce, ciphertext}`,
 * or was made with another key, for another channel, event or direction, or changed on the way.
 * `direction` is `server` (the default) for an event published over the HTTP API, `client` for a
 * client event.
 */
export async function decryptEvent(channel: string, event: string, data: any, key: ChannelKey, direction: Direction = 'server'): Promise<any> {
    if (typeof data !== 'object' || data === null || typeof data.nonce !== 'string' || typeof data.ciphertext !== 'string') {
        throw new Error('Not encrypted data');
    }
    const nonce = fromBase64(data.nonce);
    if (nonce.length !== 12) {
        throw new Error('The nonce is 12 bytes');
    }
    const plaintext = await subtle().decrypt(
        {name: 'AES-GCM', iv: nonce, additionalData: additionalData(direction, channel, event), tagLength: 128},
        await importChannelKey(key),
        fromBase64(data.ciphertext),
    );
    return JSON.parse(fromUtf8(plaintext));
}
