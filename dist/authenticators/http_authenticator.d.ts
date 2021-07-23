import { Authenticator, Options } from "../types";
export default class Http_authenticator implements Authenticator {
    private getAuthUrl;
    authenticate(clientId: string, channelName: string, options: Options): Promise<string>;
}
