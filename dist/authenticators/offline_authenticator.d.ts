import { Authenticator } from "../types";
export declare function getHMAC(data: string, secret: string): string;
export declare function authChannelWithSecret(channelName: string, data: any, secret: string, permissions?: number): string;
export default class OfflineAuthenticator implements Authenticator {
    private readonly data;
    private readonly secret;
    private readonly permissions;
    constructor(data: string, secret: string, permissions: number);
    authenticate(channelName: string, _options?: {}): Promise<string>;
}
