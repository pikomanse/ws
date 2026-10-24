/** Small helpers shared by the signing and encryption code. Web Crypto only, no dependencies. */

/** Web Crypto's `subtle`: built into browsers and Node 20+ (Node 18: `globalThis.crypto = require('node:crypto').webcrypto`). */
export function subtle(): SubtleCrypto {
    const crypto = (globalThis as any).crypto;
    if (!crypto || !crypto.subtle) {
        throw new Error('Pikoman: Web Crypto (globalThis.crypto.subtle) is not available');
    }
    return crypto.subtle;
}

export function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    (globalThis as any).crypto.getRandomValues(bytes);
    return bytes;
}

export function utf8(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

export function fromUtf8(bytes: ArrayBuffer | Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

/** Standard base64 with padding. */
export function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Standard base64 (padding optional). Throws on anything else. */
export function fromBase64(text: string): Uint8Array {
    if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
        throw new Error('Not base64');
    }
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** base64url without padding, as in JWTs. */
export function toBase64Url(bytes: Uint8Array): string {
    return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url without padding. Throws on anything else. */
export function fromBase64Url(text: string): Uint8Array {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) {
        throw new Error('Not base64url');
    }
    return fromBase64(text.replace(/-/g, '+').replace(/_/g, '/'));
}

/** A key given as base64 text or as bytes. */
export function keyBytes(key: string | Uint8Array): Uint8Array {
    return typeof key === 'string' ? fromBase64(key) : key;
}
