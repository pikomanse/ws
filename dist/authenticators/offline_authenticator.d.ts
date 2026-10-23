import { Authenticator } from "../types";
/** Imports a PKCS#8 PEM private key, as printed by `pikoman_admin gen-app`. */
export declare function importSigningKey(privateKeyPem: string): Promise<CryptoKey>;
export declare function signToken(payload: object, signingKey: CryptoKey): Promise<string>;
export declare function authChannelWithKey(clientId: string, channelName: string, data: any, signingKey: CryptoKey, permissions?: number, lifetimeSeconds?: number): Promise<string>;
export default class OfflineAuthenticator implements Authenticator {
    private readonly data;
    private readonly signingKey;
    private readonly permissions;
    /** `privateKey` is a PKCS#8 PEM string or an imported Ed25519 CryptoKey. */
    constructor(data: any, privateKey: string | CryptoKey, permissions: number);
    authenticate(clientId: string, channelName: string, _options?: {}): Promise<string>;
}
