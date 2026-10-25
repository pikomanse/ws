/**
 * Ed25519 keys and EdDSA JWTs (KEYS.md in the Pikoman 2.0 workspace).
 *
 * - Signing keys: base64 PKCS#8 (or PEM), read from `PIKOMAN_PRIVATE_KEY`, for join tokens.
 * - API keys: the secret `sk_<key id>.<base64url seed>`, read from `PIKOMAN_API_KEY`, for HTTP
 *   requests and for bots' own join tokens.
 */
import {fromBase64, fromBase64Url, subtle, toBase64Url, utf8} from './encoding';

/** PKCS#8 DER of an Ed25519 private key, before its 32-byte seed. */
const PKCS8_ED25519_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

/** The longest a join token may live, in seconds. */
export const MAX_TOKEN_LIFETIME = 600;

/** A request token lives one minute and is made for one request: never reused (KEYS.md). */
export const REQUEST_TOKEN_LIFETIME = 60;

/** The one HTTP request a request token is for. The token is bound to all three. */
export interface SignedRequest {
    /** `GET`, `POST`, `DELETE`, … in any case. */
    method: string;
    /**
     * The URL the request goes to, or its path, with the query string, as it is sent. Signed as
     * fetch sends it (`requestTarget`): an empty query, a lone `?`, is left out.
     */
    url: string;
    /** The body exactly as it is sent (text is sent as UTF-8); none for a request without one. */
    body?: string | Uint8Array | null;
}

/**
 * A token's lifetime in whole seconds (JWT times are integers): rounded down, and refused unless
 * it is more than 0 and at most `MAX_TOKEN_LIFETIME`.
 */
export function tokenLifetime(lifetimeSeconds: number): number {
    const seconds = Math.floor(lifetimeSeconds);
    if (!(seconds > 0 && seconds <= MAX_TOKEN_LIFETIME)) {
        throw new Error(`A token lives at least 1 and at most ${MAX_TOKEN_LIFETIME} seconds`);
    }
    return seconds;
}

/** A private key that signs, with the key id that goes in the JWT header as `kid`. */
export interface KeyWithId {
    keyId?: string;
    key: CryptoKey;
}

/** Imports a PKCS#8 private key: PEM, or base64 DER on one line (`MC4CAQAwBQYDK2VwBCIEI…`). */
export function importSigningKey(privateKey: string): Promise<CryptoKey> {
    const base64 = privateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    const der = fromBase64(base64);
    try {
        return subtle().importKey('pkcs8', der, {name: 'Ed25519'}, false, ['sign']);
    } finally {
        der.fill(0);
    }
}

/** Imports a 32-byte Ed25519 seed as a private key. */
export function importSeed(seed: Uint8Array): Promise<CryptoKey> {
    if (seed.length !== 32) {
        throw new Error('An Ed25519 seed is 32 bytes');
    }
    const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
    pkcs8.set(PKCS8_ED25519_PREFIX);
    pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
    try {
        // Non-extractable. Web Crypto copies the bytes when it is called, so this copy is wiped.
        return subtle().importKey('pkcs8', pkcs8, {name: 'Ed25519'}, false, ['sign']);
    } finally {
        pkcs8.fill(0);
    }
}

const SECRET = /^sk_(k_[0-9a-f]{16})\.([A-Za-z0-9_-]{43})$/;

/**
 * Reads an API key's secret, `sk_<key id>.<seed>`. Throws on anything else, without echoing the
 * secret in the message.
 */
export function parseSecret(secret: string): { keyId: string, seed: Uint8Array } {
    const match = typeof secret === 'string' ? SECRET.exec(secret.trim()) : null;
    if (!match) {
        throw new Error('Not a Pikoman API key secret (expected sk_k_<16 hex>.<43 base64url characters>)');
    }
    const seed = fromBase64Url(match[2]);
    // 43 characters hold 258 bits; only one spelling of the last one gives exactly these 32 bytes.
    if (seed.length !== 32 || toBase64Url(seed) !== match[2]) {
        throw new Error('Not a Pikoman API key secret (the seed is not 32 bytes)');
    }
    return {keyId: match[1], seed};
}

/** Imports an API key's secret: the private key, and its id for the `kid`. */
export async function importSecret(secret: string): Promise<{ keyId: string, key: CryptoKey }> {
    const {keyId, key} = startSecretImport(secret);
    return {keyId, key: await key};
}

/**
 * Checks an API key's secret at once (throws here) and starts importing it, wiping the decoded
 * seed as soon as Web Crypto has its copy. The key is non-extractable.
 */
export function startSecretImport(secret: string): { keyId: string, key: Promise<CryptoKey> } {
    const {keyId, seed} = parseSecret(secret);
    try {
        return {keyId, key: importSeed(seed)};
    } finally {
        seed.fill(0);
    }
}

const encodeJson = (value: object) => toBase64Url(utf8(JSON.stringify(value)));

/** Signs a JWT with EdDSA. `keyId`, when given, goes in the header as `kid`. */
export async function signToken(payload: object, signingKey: CryptoKey, keyId?: string): Promise<string> {
    const header = keyId ? {alg: 'EdDSA', typ: 'JWT', kid: keyId} : {alg: 'EdDSA', typ: 'JWT'};
    const signed = `${encodeJson(header)}.${encodeJson(payload)}`;
    const signature = await subtle().sign({name: 'Ed25519'}, signingKey, utf8(signed));
    return `${signed}.${toBase64Url(new Uint8Array(signature))}`;
}

async function toKeyWithId(key: string | KeyWithId): Promise<KeyWithId> {
    if (typeof key === 'string') {
        return importSecret(key);
    }
    // The server finds the API key by the kid; a request token without one is always refused.
    if (!key || !key.keyId) {
        throw new Error("A request token needs the API key's id: pass { keyId, key } or the sk_ secret");
    }
    return key;
}

/**
 * The path and query string of a URL as fetch sends them: `pathname + search` of the URL as the
 * URL parser writes it, which is what Node's fetch puts on the request line. No scheme, host or
 * fragment; `/a b` is sent as `/a%20b`, and an empty query is left out (`/a?` is sent as `/a`).
 */
export function requestTarget(url: string): string {
    const parsed = new URL(url, 'https://api.invalid');
    return parsed.pathname + parsed.search;
}

/** SHA-256 of the body, base64url without padding; for no body, of the empty string. */
export async function bodyHash(body?: string | Uint8Array | null): Promise<string> {
    let bytes: Uint8Array;
    if (body === undefined || body === null) {
        bytes = new Uint8Array(0);
    } else if (typeof body === 'string') {
        bytes = utf8(body);
    } else if (ArrayBuffer.isView(body)) {
        bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    } else {
        throw new Error('A request body to sign is text or bytes, exactly as it is sent');
    }
    return toBase64Url(new Uint8Array(await subtle().digest('SHA-256', bytes)));
}

/**
 * A token for one HTTP request to the API, signed with an API key (`sk_…` secret, or an imported
 * key and its id). It names the app, and binds the method, the path with its query and the body:
 * `{"iss", "iat", "exp": iat + 60, "htm": "POST", "htu": "/orders/created", "bh": <SHA-256 of
 * the body>}`. Make a new one for every request; one seen in a log works for nothing else, and
 * not for long.
 */
export async function requestToken(apiKey: string | KeyWithId, appId: string, request: SignedRequest): Promise<string> {
    if (!appId) {
        throw new Error('Need the app id');
    }
    if (!request || typeof request !== 'object') {
        throw new Error('A request token is made for one request: pass { method, url, body } (it no longer takes a lifetime)');
    }
    if (typeof request.method !== 'string' || !/^[A-Za-z]+$/.test(request.method)) {
        throw new Error('A request token needs the HTTP method, e.g. "POST"');
    }
    if (typeof request.url !== 'string' || request.url === '') {
        throw new Error('A request token needs the URL or path of the request');
    }
    const htm = request.method.toUpperCase();
    const htu = requestTarget(request.url);
    const bh = await bodyHash(request.body);
    const {key, keyId} = await toKeyWithId(apiKey);
    const iat = Math.floor(Date.now() / 1000);
    return signToken({iss: appId, iat, exp: iat + REQUEST_TOKEN_LIFETIME, htm, htu, bh}, key, keyId);
}

/** The `Authorization` header value for one HTTP request: `Bearer <jwt>`, see `requestToken`. */
export async function authorizationHeader(apiKey: string | KeyWithId, appId: string, request: SignedRequest): Promise<string> {
    return `Bearer ${await requestToken(apiKey, appId, request)}`;
}
