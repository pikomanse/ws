import {Authenticator, Options} from "../types";

export default class URLAuthenticator implements Authenticator {
    private getAuthUrl(channelName: string, options: Options): string {
        if (!channelName) {
            throw new Error(`Need channelName`);
        }
        if (!options.auth_url) {
            throw new Error(`Need auth_url`);
        }
        return `${options.auth_url}/${channelName}`;
    }
    async authenticate(channelName: string, options: Options): Promise<string> {
        const url = this.getAuthUrl(channelName, options);
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