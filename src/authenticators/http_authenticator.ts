import {Authenticator, JoinAuthorization, Options} from "../types";
import {checkChannelName, checkConnectionId} from "../names";

/**
 * Asks the app's backend for a join token: `POST {auth_url}` with the JSON body
 * `{"connection_id": "...", "channel": "..."}`, which answers `{"token": "..."}`, as pusher-js
 * posts to its auth endpoint. Both names are checked first against what the server takes, so the
 * backend never gets a name Pikoman would refuse. `auth_headers` are sent with it (a CSRF token, a
 * bearer token), read again at every request. For a `private-encrypted-` channel it also answers
 * the channel key, `{"token": "...", "channel_key": "<base64>"}`, and then this returns both.
 */
export default class Http_authenticator implements Authenticator {
    async authenticate(clientId: string, channelName: string, options: Options): Promise<string | JoinAuthorization> {
        if (!channelName) {
            throw new Error(`Need channelName`);
        }
        if (!options.auth_url) {
            throw new Error(`Need auth_url`);
        }
        const body = JSON.stringify({
            connection_id: checkConnectionId(clientId),
            channel: checkChannelName(channelName),
        });
        const extra = typeof options.auth_headers === "function" ? await options.auth_headers() : options.auth_headers;
        const request = await fetch(options.auth_url, {
            method: "POST",
            headers: {...extra, "Content-Type": "application/json", "Accept": "application/json"},
            body,
        });
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
