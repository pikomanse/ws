import {Authenticator} from "../types";
import {importSeed, importSigningKey, parseSecret, signToken} from "../keys";

/**
 * Signs join tokens without asking a backend.
 *
 * - In a backend, a bot or a script: with a signing key (`PIKOMAN_PRIVATE_KEY`, and optionally its
 *   id from `PIKOMAN_SIGNING_KEY_ID`), or as a bot with an API key that has `subscribe`
 *   (`OfflineAuthenticator.fromSecret(process.env.PIKOMAN_API_KEY)`).
 * - In a browser, for local experiments only: the private key is in the page, so anyone can read
 *   it. In production, browsers get tokens from the app's backend (HttpAuthenticator).
 *
 * A token is a JWT signed with EdDSA (Ed25519): `header.payload.signature`, each part base64url,
 * the same as any JWT library makes with `alg: "EdDSA"`. With a key id, the header carries `kid`.
 */

export {importSigningKey, signToken};

export function authChannelWithKey(clientId: string, channelName: string, data: any, signingKey: CryptoKey, permissions = 0, lifetimeSeconds = 300, keyId?: string): Promise<string> {
    return signToken({
        connection: clientId,
        channel: channelName,
        access: permissions,
        data,
        exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    }, signingKey, keyId);
}

export default class OfflineAuthenticator implements Authenticator {
    private readonly data: any;
    private readonly signingKey: Promise<CryptoKey>;
    private readonly permissions: number;
    private readonly keyId?: string;

    /**
     * `privateKey` is a PKCS#8 key (PEM, or base64 on one line) or an imported Ed25519 CryptoKey.
     * `keyId`, when given, goes in the token's header as `kid`: the id of one of the app's
     * signing keys, or of an API key.
     */
    constructor(data: any, privateKey: string | CryptoKey | Promise<CryptoKey>, permissions: number, keyId?: string) {
        this.data = data;
        this.signingKey = typeof privateKey === 'string' ? importSigningKey(privateKey) : Promise.resolve(privateKey);
        // Keep an unread key from being an unhandled rejection; authenticate() still throws.
        this.signingKey.catch(() => undefined);
        this.permissions = permissions;
        this.keyId = keyId;
    }

    /**
     * Joins as a bot with an API key's secret, `sk_<key id>.<seed>`. The key needs `subscribe`;
     * access 3 (`permissions`) also needs `client_events`. Throws at once if the secret is malformed.
     */
    static fromSecret(secret: string, data: any = null, permissions = 0): OfflineAuthenticator {
        const {keyId, seed} = parseSecret(secret);
        return new OfflineAuthenticator(data, importSeed(seed), permissions, keyId);
    }

    async authenticate(clientId: string, channelName: string, _options = {}): Promise<string> {
        return authChannelWithKey(clientId, channelName, this.data, await this.signingKey, this.permissions, 300, this.keyId);
    }
}
