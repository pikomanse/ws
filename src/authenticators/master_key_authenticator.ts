import {Authenticator, JoinAuthorization, Options} from "../types";
import {channelKey, isEncryptedChannel} from "../encryption";
import {keyBytes} from "../encoding";

/**
 * For a program that holds the app's master key (a backend, or a bot with an API key): gets the
 * join token from another authenticator and derives the channel key itself, so no token endpoint
 * is needed for `private-encrypted-` channels.
 *
 * ```js
 * const auth = new MasterKeyAuthenticator(
 *   OfflineAuthenticator.fromSecret(process.env.PIKOMAN_API_KEY),
 *   process.env.PIKOMAN_ENCRYPTION_KEY,
 * );
 * pikoman.listenPrivate("private-encrypted-orders", auth);
 * ```
 */
export default class MasterKeyAuthenticator implements Authenticator {
    private readonly inner: Authenticator;
    private readonly masterKey: Uint8Array;

    /** `masterKey`: the app's 32-byte master key, base64 or bytes. */
    constructor(inner: Authenticator, masterKey: string | Uint8Array) {
        this.inner = inner;
        this.masterKey = keyBytes(masterKey);
        if (this.masterKey.length !== 32) {
            throw new Error('The master key is 32 bytes');
        }
    }

    async authenticate(clientId: string, channelName: string, options: Options): Promise<string | JoinAuthorization> {
        const answer = await this.inner.authenticate(clientId, channelName, options);
        const token = typeof answer === 'string' ? answer : answer.token;
        if (!isEncryptedChannel(channelName)) {
            return token;
        }
        return {token, channel_key: await channelKey(this.masterKey, channelName)};
    }
}
