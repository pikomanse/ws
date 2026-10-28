import {Authenticator, JoinAuthorization, Options} from "../types";
import {channelKey, isEncryptedChannel, MasterKey, startMasterKeyImport} from "../encryption";
import {INSPECT, refuseInBrowser} from "../redact";

/** The master key of each authenticator, out of reach of JSON.stringify and util.inspect. */
const masterKeys = new WeakMap<MasterKeyAuthenticator, Promise<CryptoKey>>();

/**
 * For a program that holds the app's master key (a backend, or a bot with an API key): gets the
 * join token from another authenticator and derives the channel key itself, so no token endpoint
 * is needed for `private-encrypted-` channels.
 *
 * ```js
 * const auth = new MasterKeyAuthenticator(
 *   TokenSigner.fromSecret(process.env.PIKOMAN_API_KEY),
 *   process.env.PIKOMAN_ENCRYPTION_KEY,
 * );
 * pikoman.listenPrivate("private-encrypted-orders", auth);
 * ```
 *
 * The master key is kept only as a non-extractable HMAC CryptoKey, never as bytes.
 */
export default class MasterKeyAuthenticator implements Authenticator {
    private readonly inner: Authenticator;

    /** `masterKey`: the app's 32-byte master key, base64 or bytes, or the CryptoKey from `importMasterKey`. */
    constructor(inner: Authenticator, masterKey: MasterKey) {
        refuseInBrowser('MasterKeyAuthenticator');
        this.inner = inner;
        const key = startMasterKeyImport(masterKey);
        key.catch(() => undefined);
        masterKeys.set(this, key);
    }

    async authenticate(clientId: string, channelName: string, options: Options): Promise<string | JoinAuthorization> {
        const answer = await this.inner.authenticate(clientId, channelName, options);
        const token = typeof answer === 'string' ? answer : answer.token;
        if (!isEncryptedChannel(channelName)) {
            return token;
        }
        if (!options.app) {
            throw new Error('Pikoman: MasterKeyAuthenticator needs the app id, which Pikoman passes in the options');
        }
        return {token, channel_key: await channelKey(await (masterKeys.get(this) as Promise<CryptoKey>), options.app, channelName)};
    }

    toJSON() {
        return {masterKey: '[hidden]'};
    }

    [INSPECT]() {
        return 'MasterKeyAuthenticator { masterKey: [hidden] }';
    }
}
