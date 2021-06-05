import {Authenticator, Options} from "../types";

export default class Http_authenticator implements Authenticator {
    private getAuthUrl(clientId: string, channelName: string, options: Options): string {
        if (!channelName) {
            throw new Error(`Need channelName`);
        }
        if (!options.auth_url) {
            throw new Error(`Need auth_url`);
        }
        return `${options.auth_url}/${clientId}-${channelName}`;
    }
    async authenticate(clientId: string, channelName: string, options: Options): Promise<string> {
        const url = this.getAuthUrl(clientId, channelName, options);
        const request = await fetch(url);
        if (!request.ok) {
            throw new Error('Request was not successful');
        }
        const response = await request.json();
        if (!response.auth) {
            throw new Error('No auth in response');
        }
        return response.auth;
    }

}