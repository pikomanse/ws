import { Authenticator, Options } from "../types";
export default class URLAuthenticator implements Authenticator {
    private getAuthUrl;
    authenticate(clientId: number, channelName: string, options: Options): Promise<string>;
}
