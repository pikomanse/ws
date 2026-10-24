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

/** The longest a request token may live, in seconds (`exp - iat`). */
export const MAX_TOKEN_LIFETIME = 600;

/** A private key that signs, with the key id that goes in the JWT header as `kid`. */
export interface KeyWithId {
    keyId?: string;
    key: CryptoKey;
}

/** Imports a PKCS#8 private key: PEM, or base64 DER on one line (`MC4CAQAwBQYDK2VwBCIEI…`). */
export function importSigningKey(privateKey: string): Promise<CryptoKey> {
    const base64 = privateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    return subtle().importKey('pkcs8', fromBase64(base64), {name: 'Ed25519'}, false, ['sign']);
}

/** Imports a 32-byte Ed25519 seed as a private key. */
export function importSeed(seed: Uint8Array): Promise<CryptoKey> {
    if (seed.length !== 32) {
        throw new Error('An Ed25519 seed is 32 bytes');
    }
    const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
    pkcs8.set(PKCS8_ED25519_PREFIX);
    pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
    return subtle().importKey('pkcs8', pkcs8, {name: 'Ed25519'}, false, ['sign']);
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
    const {keyId, seed} = parseSecret(secret);
    return {keyId, key: await importSeed(seed)};
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
    return typeof key === 'string' ? importSecret(key) : key;
}

/**
 * A token for one HTTP request to the API: `{"iss": appId, "iat": now, "exp": now + lifetime}`,
 * signed with an API key (`sk_…` secret, or an imported key and its id). Lifetime at most 600 s.
 */
export async function requestToken(apiKey: string | KeyWithId, appId: string, lifetimeSeconds = 300): Promise<string> {
    if (!appId) {
        throw new Error('Need the app id');
    }
    if (!(lifetimeSeconds > 0 && lifetimeSeconds <= MAX_TOKEN_LIFETIME)) {
        throw new Error(`A request token lives at most ${MAX_TOKEN_LIFETIME} seconds`);
    }
    const {key, keyId} = await toKeyWithId(apiKey);
    const iat = Math.floor(Date.now() / 1000);
    return signToken({iss: appId, iat, exp: iat + lifetimeSeconds}, key, keyId);
}

/** The `Authorization` header value for one HTTP request: `Bearer <jwt>`. */
export async function authorizationHeader(apiKey: string | KeyWithId, appId: string, lifetimeSeconds = 300): Promise<string> {
    return `Bearer ${await requestToken(apiKey, appId, lifetimeSeconds)}`;
}
