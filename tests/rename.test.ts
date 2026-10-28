import {OfflineAuthenticator, TokenSigner} from '../src';
import * as server from '../src/server';

describe('TokenSigner', () => {
    it('Should still answer to its name before rc.11', () => {
        expect(OfflineAuthenticator).toBe(TokenSigner);
        expect(server.OfflineAuthenticator).toBe(TokenSigner);
        expect(server.TokenSigner).toBe(TokenSigner);
        const signer: OfflineAuthenticator = new TokenSigner({}, Promise.reject(new Error('no key')), 3);
        expect(signer).toBeInstanceOf(OfflineAuthenticator);
    });
});
