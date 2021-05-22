import {sha256} from "js-sha256";
import {Authenticator} from "../types";

export function getHMAC(data: string, secret: string): string {
    return sha256.hmac(secret, `${data}`);
}
export function authChannelWithSecret(clientId: number, channelName: string, data: any, secret: string, permissions = 0): string {
    const strData = JSON.stringify(data);
    const s = `${clientId}:${channelName}:${permissions}:${strData}`;
    const hmac = getHMAC(s, secret);
    return `${channelName}:${hmac}:${permissions}:${strData}`;
}

export default class OfflineAuthenticator implements Authenticator {
    private readonly data: string;
    private readonly secret: string;
    private readonly permissions: number;
    constructor(data: string, secret: string, permissions: number) {
        this.data = data;
        this.secret = secret;
        this.permissions = permissions;
    }
    async authenticate(clientId: number, channelName: string, _options = {}): Promise<string> {
        return '2:' + authChannelWithSecret(clientId, channelName, this.data, this.secret, this.permissions);
    }
}