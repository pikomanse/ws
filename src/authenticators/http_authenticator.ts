import {Authenticator, JoinAuthorization, Options} from "../types";
import {checkChannelName, checkConnectionId} from "../names";

/**
 * Asks the app's backend for a join token: `GET {auth_url}/{clientId}-{channelName}`, which
 * answers `{"token": "..."}`. Both names are checked first against what the server takes, so a
 * channel name from a URL parameter cannot point the request at another path on the backend. For a `private-encrypted-` channel it also answers the channel key,
 * `{"token": "...", "channel_key": "<base64>"}`, and then this returns both.
 */
export default class Http_authenticator implements Authenticator {
    private getAuthUrl(clientId: string, channelName: string, options: Options): string {
        if (!channelName) {
            throw new Error(`Need channelName`);
        }
        if (!options.auth_url) {
            throw new Error(`Need auth_url`);
        }
        return `${options.auth_url}/${checkConnectionId(clientId)}-${checkChannelName(channelName)}`;
    }

    async authenticate(clientId: string, channelName: string, options: Options): Promise<string | JoinAuthorization> {
        const url = this.getAuthUrl(clientId, channelName, options);
        const request = await fetch(url);
        if (!request.ok) {
            throw new Error('Request was not successful');
        }
        const response = await request.json();
        if (!response.token) {
            throw new Error('No token in response');
        }
        if (typeof response.channel_key === 'string') {
            return {token: response.token, channel_key: response.channel_key};
        }
        return response.token;
    }

}
