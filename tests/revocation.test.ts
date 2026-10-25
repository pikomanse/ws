/**
 * @jest-environment node
 */
import {Authenticator, Pikoman} from '../src';
import {installWebGlobals} from './web_globals';

/** Stands in for the WebSocket, so no test touches the network. */
class FakeWebSocket {
    static OPEN = 1;
    static last: FakeWebSocket;
    static made = 0;
    readyState = FakeWebSocket.OPEN;
    sent: any[] = [];

    constructor(public url: string) {
        FakeWebSocket.last = this;
        FakeWebSocket.made += 1;
    }

    send(data: string) {
        this.sent.push(JSON.parse(data));
    }

    close() {
    }
}

const g = globalThis as any;
const realWebSocket = g.WebSocket;
const opened: Pikoman[] = [];
beforeAll(installWebGlobals);
beforeEach(() => {
    g.WebSocket = FakeWebSocket;
});
afterEach(() => {
    opened.splice(0).forEach((pikoman: any) => pikoman.closeQuietly());
    g.WebSocket = realWebSocket;
    jest.useRealTimers();
});

function connect() {
    const pikoman = new Pikoman('app-test', {ws_address: 'ws://localhost', auth_url: 'https://app.example/auth'});
    opened.push(pikoman);
    const socket = FakeWebSocket.last;
    const receive = (message: object) => (pikoman as any).onMessage({data: JSON.stringify(message)});
    receive({op: 'connected', id: 'c_me'});
    return {pikoman, socket, receive};
}

const until = async (done: () => boolean, tries = 2000) => {
    for (let i = 0; i < tries && !done(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(done()).toBe(true);
};

describe('When the server revokes a key', () => {
    it('Should join a private channel again with a new token after key_revoked', async () => {
        let asked = 0;
        const auth: Authenticator = {authenticate: async () => `token-${++asked}`};
        const {pikoman, socket, receive} = connect();
        const channel = pikoman.listenPrivate('private-room', auth);
        const refused = jest.fn();
        channel.refused(refused);
        await until(() => socket.sent.length === 1);
        receive({op: 'joined', channel: 'private-room'});

        receive({op: 'error', channel: 'private-room', code: 'key_revoked'});
        receive({op: 'left', channel: 'private-room'});
        expect(refused.mock.calls).toEqual([['key_revoked']]);
        await until(() => socket.sent.length === 2);
        expect(socket.sent[1]).toEqual({op: 'join', channel: 'private-room', token: 'token-2'});
    });

    it('Should not join again after the app left the channel', async () => {
        const {pikoman, socket, receive} = connect();
        const channel = pikoman.listenPrivate('private-room', {authenticate: async () => 'token'});
        await until(() => socket.sent.length === 1);
        receive({op: 'error', channel: 'private-room', code: 'key_revoked'});
        channel.leave();
        await new Promise((resolve) => setTimeout(resolve, 1200));
        expect(socket.sent.map((m: any) => m.op)).toEqual(['join', 'leave']);
    });

    it('Should stay offline after close code 4403 instead of connecting again', () => {
        jest.useFakeTimers();
        const {pikoman} = connect();
        const made = FakeWebSocket.made;
        (pikoman as any).onClose({code: 4403});
        jest.advanceTimersByTime(30_000);
        expect(FakeWebSocket.made).toBe(made);
    });

    it('Should still connect again after an ordinary close', () => {
        jest.useFakeTimers();
        const {pikoman} = connect();
        const made = FakeWebSocket.made;
        (pikoman as any).onClose({code: 1006});
        jest.advanceTimersByTime(6_000);
        expect(FakeWebSocket.made).toBe(made + 1);
    });
});
