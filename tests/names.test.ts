/**
 * @jest-environment node
 */
import {HttpAuthenticator, Pikoman, Rest} from '../src';
import {checkAppId, checkChannelName, checkConnectionId, checkedAddress} from '../src/names';
import {installWebGlobals} from './web_globals';

// Test keys only.
const SECRET = `sk_k_3f9a1c0e5b7d2468.${Buffer.alloc(32, 7).toString('base64url')}`;

describe('Names and addresses', () => {
    beforeAll(() => {
        installWebGlobals();
    });

    it('Should take only what the server takes as channel names, app ids and connection ids', () => {
        expect(checkChannelName('presence-room_1=@,.;')).toBe('presence-room_1=@,.;');
        for (const bad of ['', 'a'.repeat(165), 'private-x/../../api', 'a?b', 'a#b', 'a b', 'a%2Fb', 'privaté']) {
            expect(() => checkChannelName(bad)).toThrow(/not a channel name/);
        }
        expect(checkAppId('app-Test_1')).toBe('app-Test_1');
        for (const bad of ['', 'a'.repeat(65), 'app/x', 'app.x', '../app']) {
            expect(() => checkAppId(bad)).toThrow(/not an app id/);
        }
        expect(checkConnectionId('c_d582fc9a3a812fe5a3356aa5')).toBe('c_d582fc9a3a812fe5a3356aa5');
        for (const bad of ['', 'c_', 'x_1', 'c_1/..', 'c_1?']) {
            expect(() => checkConnectionId(bad)).toThrow(/not a connection id/);
        }
    });

    it('Should never point the token request at another path', async () => {
        const urls: string[] = [];
        (globalThis as any).fetch = async (url: string) => {
            urls.push(url);
            return {ok: true, json: async () => ({token: 'jwt'})};
        };
        const auth = new HttpAuthenticator();
        await expect(auth.authenticate('c_1', 'private-x/../../../api/account/delete?', {auth_url: '/auth'})).rejects.toThrow(/not a channel name/);
        await expect(auth.authenticate('c_1/../admin', 'private-x', {auth_url: '/auth'})).rejects.toThrow(/not a connection id/);
        expect(urls).toEqual([]);
        expect(await auth.authenticate('c_1', 'private-x', {auth_url: '/auth'})).toBe('jwt');
        expect(urls).toEqual(['/auth/c_1-private-x']);
    });

    it('Should keep keys off the network in the clear, but allow plain addresses on this machine', () => {
        expect(checkedAddress('https://api.example/', 'https', 'http')).toBe('https://api.example');
        expect(checkedAddress('http://localhost:9999', 'https', 'http')).toBe('http://localhost:9999');
        expect(checkedAddress('http://127.0.0.1:9999', 'https', 'http')).toBe('http://127.0.0.1:9999');
        expect(checkedAddress('ws://[::1]:9999', 'wss', 'ws')).toBe('ws://[::1]:9999');
        expect(() => checkedAddress('http://api.example', 'https', 'http')).toThrow(/use https:\/\//);
        expect(() => checkedAddress('ws://next.pikoman.se', 'wss', 'ws')).toThrow(/use wss:\/\//);
        expect(() => checkedAddress('ftp://api.example', 'https', 'http')).toThrow(/use https:\/\//);
        expect(() => checkedAddress('not an address', 'https', 'http')).toThrow(/not an address/);
        // Rest and, outside a browser, the websocket address follow the same rule.
        expect(() => new Rest({app: 'app-test', apiKey: SECRET, address: 'http://api.example'})).toThrow(/use https:\/\//);
        expect(() => new Rest({app: 'app-test', apiKey: SECRET, address: 'http://localhost:9999'})).not.toThrow();
        expect(() => new Pikoman('app-test', {ws_address: 'ws://next.pikoman.se'})).toThrow(/use wss:\/\//);
        expect(() => new Pikoman('app/../x', {ws_address: 'wss://next.pikoman.se'})).toThrow(/not an app id/);
    });
});
