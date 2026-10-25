/**
 * @jest-environment node
 */
import {
    Authenticator,
    channelKey,
    decryptEvent,
    encryptEvent,
    EncryptedChannel,
    HttpAuthenticator,
    MasterKeyAuthenticator,
    OfflineAuthenticator,
    Pikoman,
} from '../src';
import {installWebGlobals} from './web_globals';

// Test keys only.
const MASTER = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const CHANNEL = 'private-encrypted-test';
const TEST_CHANNEL_KEY = 'tYiq/FY0unmbT9GVQeR6NNCdJhPvlbl6+70+E0B0cS0=';
const SECRET = `sk_k_3f9a1c0e5b7d2468.${Buffer.alloc(32, 7).toString('base64url')}`;

/** Stands in for the WebSocket, so no test touches the network. */
class FakeWebSocket {
    static OPEN = 1;
    static last: FakeWebSocket;
    readyState = FakeWebSocket.OPEN;
    sent: any[] = [];

    constructor(public url: string) {
        FakeWebSocket.last = this;
    }

    send(data: string) {
        this.sent.push(JSON.parse(data));
    }

    close() {
    }
}

const g = globalThis as any;
const realWebSocket = g.WebSocket;
const realFetch = g.fetch;
const opened: Pikoman[] = [];
beforeAll(installWebGlobals);
beforeEach(() => {
    g.WebSocket = FakeWebSocket;
});
afterEach(() => {
    // Stops the ping and offline timers.
    opened.splice(0).forEach((pikoman: any) => pikoman.closeQuietly());
    g.WebSocket = realWebSocket;
    g.fetch = realFetch;
});

function connect() {
    const pikoman = new Pikoman('app-test', {ws_address: 'ws://localhost', auth_url: 'https://app.example/auth'});
    opened.push(pikoman);
    const socket = FakeWebSocket.last;
    const receive = (message: object) => (pikoman as any).onMessage({data: JSON.stringify(message)});
    receive({op: 'connected', id: 'c_me'});
    return {pikoman, socket, receive};
}

/** Waits until `done()` holds; Web Crypto runs on Node's thread pool, so it can take a while. */
const until = async (done: () => boolean) => {
    for (let i = 0; i < 1000 && !done(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(done()).toBe(true);
};

const withKey: Authenticator = {
    authenticate: async (clientId, channel) => ({token: `token-${clientId}-${channel}`, channel_key: TEST_CHANNEL_KEY}),
};

describe('Encrypted channels', () => {
    it('Should join like a private channel, with the key from the authenticator', async () => {
        const {pikoman, socket} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey);
        expect(channel).toBeInstanceOf(EncryptedChannel);
        await until(() => socket.sent.length > 0);
        expect(socket.sent).toEqual([{op: 'join', channel: CHANNEL, token: `token-c_me-${CHANNEL}`}]);
    });

    it('Should read channel_key from the token endpoint', async () => {
        const urls: string[] = [];
        g.fetch = async (url: string) => {
            urls.push(url);
            return {ok: true, json: async () => ({token: 'jwt', channel_key: TEST_CHANNEL_KEY})};
        };
        const {pikoman, socket, receive} = connect();
        const channel = pikoman.listenPrivate(CHANNEL);
        const on = jest.fn();
        channel.on('message', on);
        await until(() => socket.sent.length > 0);
        expect(urls).toEqual([`https://app.example/auth/c_me-${CHANNEL}`]);
        expect(socket.sent).toEqual([{op: 'join', channel: CHANNEL, token: 'jwt'}]);
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', {text: 'hej'}, TEST_CHANNEL_KEY)});
        await until(() => on.mock.calls.length > 0);
        expect(on.mock.calls).toEqual([[{text: 'hej'}]]);
    });

    it('Should answer the token alone from HttpAuthenticator when there is no channel key', async () => {
        g.fetch = async () => ({ok: true, json: async () => ({token: 'jwt'})});
        expect(await new HttpAuthenticator().authenticate('c_me', 'private-a', {auth_url: '/auth'})).toBe('jwt');
    });

    it('Should not join without a channel key, and say so', async () => {
        const {pikoman, socket} = connect();
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const channel = pikoman.listenPrivate(CHANNEL, {authenticate: async () => 'token-only'});
        const refused = jest.fn();
        channel.refused(refused);
        await until(() => refused.mock.calls.length > 0);
        error.mockRestore();
        expect(socket.sent).toEqual([]);
        expect(refused.mock.calls).toEqual([['no_channel_key']]);
    });

    it('Should decrypt server and client events, in order, before handlers see them', async () => {
        const {pikoman, socket, receive} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey);
        await until(() => socket.sent.length > 0);
        const onMessage = jest.fn();
        const onClientMessage = jest.fn();
        const serverMessage = jest.fn();
        const clientMessage = jest.fn();
        channel.on('message', onMessage);
        channel.onClient('message', onClientMessage);
        channel.serverMessage(serverMessage);
        channel.clientMessage(clientMessage);

        const messages = [];
        for (let n = 1; n <= 5; n++) {
            messages.push({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', {n}, TEST_CHANNEL_KEY)});
        }
        messages.push({op: 'client_event', channel: CHANNEL, from: 'c_ola', event: 'client-message', data: await encryptEvent(CHANNEL, 'client-message', 'from Ola', TEST_CHANNEL_KEY, 'client')});
        // From an older client, which sent the name without client-: decrypted with the name it was
        // sent under, handled under its client- name.
        messages.push({op: 'client_event', channel: CHANNEL, from: 'c_old', event: 'message', data: await encryptEvent(CHANNEL, 'message', 'from an old client', TEST_CHANNEL_KEY, 'client')});
        messages.forEach(receive);
        await until(() => onClientMessage.mock.calls.length >= 2);

        expect(onMessage.mock.calls).toEqual([[{n: 1}], [{n: 2}], [{n: 3}], [{n: 4}], [{n: 5}]]);
        expect(onClientMessage.mock.calls).toEqual([['c_ola', 'from Ola'], ['c_old', 'from an old client']]);
        expect(serverMessage.mock.calls).toEqual([1, 2, 3, 4, 5].map((n) => [{n}, 'message']));
        expect(clientMessage.mock.calls).toEqual([['c_ola', 'client-message', 'from Ola'], ['c_old', 'client-message', 'from an old client']]);
    });

    it('Should drop what does not decrypt and report decrypt_failed', async () => {
        const {pikoman, socket, receive} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey);
        await until(() => socket.sent.length > 0);
        const on = jest.fn();
        const refused = jest.fn();
        channel.on('message', on);
        channel.refused(refused);

        const otherKey = await channelKey(MASTER, 'app-test', 'private-encrypted-other');
        receive({op: 'event', channel: CHANNEL, event: 'message', data: {text: 'plain'}});
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 1, otherKey)});
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'other-event', 2, TEST_CHANNEL_KEY)});
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 3, TEST_CHANNEL_KEY)});
        await until(() => on.mock.calls.length + refused.mock.calls.length >= 4);

        expect(on.mock.calls).toEqual([[3]]);
        expect(refused.mock.calls).toEqual([['decrypt_failed'], ['decrypt_failed'], ['decrypt_failed']]);
    });

    it('Should keep delivering after a handler throws, and throw its error on its own', async () => {
        const thrown: unknown[] = [];
        const realSetTimeout = g.setTimeout;
        // Catches what is thrown from a timer, which would otherwise end the test run.
        const timers = jest.spyOn(g, 'setTimeout').mockImplementation(((fn: Function, ms?: number, ...args: any[]) =>
            realSetTimeout(() => {
                try {
                    fn(...args);
                } catch (e) {
                    thrown.push(e);
                }
            }, ms)) as any);
        try {
            const {pikoman, socket, receive} = connect();
            const channel = pikoman.listenPrivate(CHANNEL, withKey);
            await until(() => socket.sent.length > 0);
            const seen: any[] = [];
            channel.on('message', (data: any) => {
                seen.push(data);
                if (data === 1) {
                    throw new Error('handler broke');
                }
            });
            channel.refused(() => {
                throw new Error('refused handler broke');
            });
            receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 1, TEST_CHANNEL_KEY)});
            receive({op: 'event', channel: CHANNEL, event: 'message', data: {text: 'plain'}});
            receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 2, TEST_CHANNEL_KEY)});
            await until(() => seen.length >= 2 && thrown.length >= 2);
            expect(seen).toEqual([1, 2]);
            expect(thrown.map((e) => (e as Error).message)).toEqual(['handler broke', 'refused handler broke']);
        } finally {
            timers.mockRestore();
        }
    });

    it('Should not let a client event pass as the server, or back', async () => {
        const {pikoman, socket, receive} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey);
        await until(() => socket.sent.length > 0);
        const on = jest.fn();
        const refused = jest.fn();
        channel.on('message', on);
        channel.refused(refused);

        // A member's ciphertext passed off as the backend's, and the other way round.
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 'fake', TEST_CHANNEL_KEY, 'client')});
        receive({op: 'client_event', channel: CHANNEL, from: 'c_ola', event: 'message', data: await encryptEvent(CHANNEL, 'message', 'fake', TEST_CHANNEL_KEY, 'server')});
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 'real', TEST_CHANNEL_KEY, 'server')});
        await until(() => on.mock.calls.length + refused.mock.calls.length >= 3);

        expect(on.mock.calls).toEqual([['real']]);
        expect(refused.mock.calls).toEqual([['decrypt_failed'], ['decrypt_failed']]);
    });

    it('Should encrypt what send sends', async () => {
        const {pikoman, socket} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey) as EncryptedChannel;
        await until(() => socket.sent.length > 0);
        await channel.send('vote', {up: true}, true);
        await channel.send('typing');
        const [vote, typing] = socket.sent.slice(1);
        // Named client-…, and encrypted under that name: the one the members decrypt with.
        expect(vote).toMatchObject({op: 'send', channel: CHANNEL, event: 'client-vote', echo: true});
        expect(Object.keys(vote.data).sort()).toEqual(['ciphertext', 'nonce']);
        expect(await decryptEvent(CHANNEL, 'client-vote', vote.data, TEST_CHANNEL_KEY, 'client')).toEqual({up: true});
        await expect(decryptEvent(CHANNEL, 'client-vote', vote.data, TEST_CHANNEL_KEY, 'server')).rejects.toThrow();
        await expect(decryptEvent(CHANNEL, 'vote', vote.data, TEST_CHANNEL_KEY, 'client')).rejects.toThrow();
        expect(typing).toMatchObject({op: 'send', channel: CHANNEL, event: 'client-typing', echo: false});
        expect(await decryptEvent(CHANNEL, 'client-typing', typing.data, TEST_CHANNEL_KEY, 'client')).toBeNull();
        await expect(channel.send('')).rejects.toThrow(/name/);
    });

    it('Should reject a send that went nowhere because the connection is offline', async () => {
        const {pikoman, socket} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey) as EncryptedChannel;
        await until(() => socket.sent.length > 0);
        socket.readyState = 3; // CLOSED
        await expect(channel.send('vote', 1)).rejects.toThrow(/Not connected/);
        socket.readyState = FakeWebSocket.OPEN;
        await channel.send('vote', 2);
        expect(socket.sent).toHaveLength(2);
    });

    it('Should refuse data that has no JSON form', async () => {
        const {pikoman, socket} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, withKey) as EncryptedChannel;
        await until(() => socket.sent.length > 0);
        await expect(channel.send('vote', () => 1)).rejects.toThrow(/no JSON/);
        await expect(channel.send('vote', Symbol('s'))).rejects.toThrow(/no JSON/);
        const plain = pikoman.listenPrivate('private-plain', {authenticate: async () => 'token'});
        expect(() => plain.send('vote', () => 1)).toThrow(/no JSON/);
        expect(socket.sent.filter((m: any) => m.op === 'send')).toEqual([]);
    });

    it('Should refuse to send before it has a key', async () => {
        const {pikoman, socket} = connect();
        const channel = pikoman.listenPrivate(CHANNEL, {authenticate: () => new Promise(() => undefined)}) as EncryptedChannel;
        await expect(channel.send('vote', 1)).rejects.toThrow(/No channel key/);
        expect(socket.sent).toEqual([]);
    });

    it('Should let a program with the master key join without an endpoint', async () => {
        const {pikoman, socket, receive} = connect();
        const auth = new MasterKeyAuthenticator(OfflineAuthenticator.fromSecret(SECRET, {bot: true}, 3), MASTER);
        const channel = pikoman.listenPrivate(CHANNEL, auth);
        const on = jest.fn();
        channel.on('message', on);
        await until(() => socket.sent.length > 0);
        expect(socket.sent[0]).toMatchObject({op: 'join', channel: CHANNEL});
        expect(socket.sent[0].token.split('.')).toHaveLength(3);
        receive({op: 'event', channel: CHANNEL, event: 'message', data: await encryptEvent(CHANNEL, 'message', 'hi', TEST_CHANNEL_KEY)});
        await until(() => on.mock.calls.length > 0);
        expect(on.mock.calls).toEqual([['hi']]);
        // Channels that are not encrypted get the token alone.
        expect(typeof await auth.authenticate('c_me', 'private-plain', {})).toBe('string');
    });
});
