import {Authenticator} from "../types";

/**
 * Signs join tokens in the browser, for local experiments only: the private key is in the page,
 * so anyone can read it. In production, tokens come from the app's backend (HttpAuthenticator).
 *
 * A token is a JWT signed with EdDSA (Ed25519): `header.payload.signature`, each part base64url,
 * the same as any JWT library makes with `alg: "EdDSA"`.
 */

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBytes(pem: string): Uint8Array {
    const base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Imports a PKCS#8 PEM private key, as printed by `pikoman_admin gen-app`. */
export function importSigningKey(privateKeyPem: string): Promise<CryptoKey> {
    return crypto.subtle.importKey('pkcs8', pemToBytes(privateKeyPem), {name: 'Ed25519'}, false, ['sign']);
}

const encodeJson = (value: object) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));

export async function signToken(payload: object, signingKey: CryptoKey): Promise<string> {
    const signed = `${encodeJson({alg: 'EdDSA', typ: 'JWT'})}.${encodeJson(payload)}`;
    const signature = await crypto.subtle.sign({name: 'Ed25519'}, signingKey, new TextEncoder().encode(signed));
    return `${signed}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function authChannelWithKey(clientId: string, channelName: string, data: any, signingKey: CryptoKey, permissions = 0, lifetimeSeconds = 300): Promise<string> {
    return signToken({
        connection: clientId,
        channel: channelName,
        access: permissions,
        data,
        exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    }, signingKey);
}

export default class OfflineAuthenticator implements Authenticator {
    private readonly data: any;
    private readonly signingKey: Promise<CryptoKey>;
    private readonly permissions: number;

    /** `privateKey` is a PKCS#8 PEM string or an imported Ed25519 CryptoKey. */
    constructor(data: any, privateKey: string | CryptoKey, permissions: number) {
        this.data = data;
        this.signingKey = typeof privateKey === 'string' ? importSigningKey(privateKey) : Promise.resolve(privateKey);
        this.permissions = permissions;
    }

    async authenticate(clientId: string, channelName: string, _options = {}): Promise<string> {
        return authChannelWithKey(clientId, channelName, this.data, await this.signingKey, this.permissions);
    }
}
