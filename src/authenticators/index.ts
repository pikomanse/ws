import HttpAuthenticator from './http_authenticator';
import TokenSigner from './token_signer';
import MasterKeyAuthenticator from './master_key_authenticator';

/** The name `TokenSigner` had until rc.11; it is the same class. */
const OfflineAuthenticator = TokenSigner;
type OfflineAuthenticator = TokenSigner;

export {HttpAuthenticator, TokenSigner, OfflineAuthenticator, MasterKeyAuthenticator};
