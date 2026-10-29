import HttpAuthenticator from './http_authenticator';
import TokenSigner from './token_signer';
import EncryptedChannelAuthenticator from './encrypted_channel_authenticator';

/** The name `TokenSigner` had until rc.11; it is the same class. */
const OfflineAuthenticator = TokenSigner;
type OfflineAuthenticator = TokenSigner;

/** The name `EncryptedChannelAuthenticator` had until rc.12; it is the same class. */
const MasterKeyAuthenticator = EncryptedChannelAuthenticator;
type MasterKeyAuthenticator = EncryptedChannelAuthenticator;

export {HttpAuthenticator, TokenSigner, OfflineAuthenticator, EncryptedChannelAuthenticator, MasterKeyAuthenticator};
