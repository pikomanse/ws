/**
 * The parts for backends, bots and tools, without the websocket client:
 * `require("@pikoman/ws/dist/server")`. Everything here is also exported from the main entry.
 * Web Crypto and fetch only, so it runs in Node 20+, Deno, Bun and workers.
 */
export {Rest, publish, DEFAULT_API_ADDRESS} from './rest';
export type {RestOptions} from './rest';
export {
    parseSecret,
    importSecret,
    importSeed,
    importSigningKey,
    signToken,
    requestToken,
    authorizationHeader,
    MAX_TOKEN_LIFETIME,
} from './keys';
export type {KeyWithId} from './keys';
export {
    channelKey,
    importChannelKey,
    encryptEvent,
    decryptEvent,
    isEncryptedChannel,
    ENCRYPTED_PREFIX,
} from './encryption';
export type {EncryptedData, ChannelKey, Direction} from './encryption';
export {default as OfflineAuthenticator} from './authenticators/offline_authenticator';
export {default as MasterKeyAuthenticator} from './authenticators/master_key_authenticator';
