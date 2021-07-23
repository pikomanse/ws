import { Authenticator } from "../types";
export declare function getHMAC(data: string, secret: string): string;
export declare function authChannelWithSecret(clientId: string, channelName: string, data: any, secret: string, permissions?: number): string;
export default class OfflineAuthenticator implements Authenticator {
    private readonly data;
    private readonly secret;
    private readonly permissions;
    constructor(data: any, secret: string, permissions: number);
    authenticate(clientId: string, channelName: string, _options?: {}): Promise<string>;
}
