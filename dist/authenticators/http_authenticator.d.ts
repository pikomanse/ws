import { Authenticator, Options } from "../types";
/**
 * Asks the app's backend for a join token: `GET {auth_url}/{clientId}-{channelName}`, which
 * answers `{"token": "..."}`.
 */
export default class Http_authenticator implements Authenticator {
    private getAuthUrl;
    authenticate(clientId: string, channelName: string, options: Options): Promise<string>;
}
