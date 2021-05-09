import { Authenticator, Options } from "../types";
export default class URLAuthenticator implements Authenticator {
    private getAuthUrl;
    authenticate(channelName: string, options: Options): Promise<string>;
}
