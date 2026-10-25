/**
 * Reconnecting: backoff with jitter, never two sockets at once, close() for good, and app
 * callbacks that throw. A fake WebSocket stands in for the browser's, so no test touches the
 * network.
 */
import {ConnectionStatus, Pikoman} from '../src';

class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static all: FakeWebSocket[] = [];
    readyState = FakeWebSocket.CONNECTING;
    sent: any[] = [];
    closed = false;
    onopen: any = null;
    onmessage: any = null;
    onclose: any = null;
    onerror: any = null;

    constructor(public url: string) {
        FakeWebSocket.all.push(this);
    }

    send(data: string) {
        this.sent.push(JSON.parse(data));
    }

    close() {
        this.closed = true;
        this.readyState = FakeWebSocket.CLOSED;
    }

    /** The upgrade went through; the server has not said `connected` yet. */
    open() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.({});
    }

    /** What the server does: open, then say `connected`. */
    accept(id: string) {
        this.open();
        this.receive({op: 'connected', id});
    }

    receive(message: object) {
        this.onmessage?.({data: JSON.stringify(message)});
    }

    /** The network or the server closes it: an error first, then the close, as browsers do. */
    drop(code = 1006) {
        this.readyState = FakeWebSocket.CLOSED;
        this.onerror?.({});
        this.onclose?.({code});
    }
}

const g = globalThis as any;
const realWebSocket = g.WebSocket;
const opened: Pikoman[] = [];
let random: jest.SpyInstance;

beforeEach(() => {
    FakeWebSocket.all = [];
    g.WebSocket = FakeWebSocket;
    jest.useFakeTimers();
    random = jest.spyOn(Math, 'random').mockReturnValue(0.999);
});
afterEach(() => {
    opened.splice(0).forEach((pikoman) => pikoman.close());
    random.mockRestore();
    g.WebSocket = realWebSocket;
    jest.useRealTimers();
});

function start() {
    const pikoman = new Pikoman('app-test', {ws_address: 'ws://localhost'});
    opened.push(pikoman);
    return pikoman;
}

const live = () => FakeWebSocket.all.filter((ws) => !ws.closed);
const last = () => FakeWebSocket.all[FakeWebSocket.all.length - 1];

/** Keeps the current connection alive for `ms`: the server answers every few seconds. */
function stayConnected(ms: number) {
    for (let passed = 0; passed < ms; passed += 5000) {
        jest.advanceTimersByTime(Math.min(5000, ms - passed));
        last().receive({op: 'pong'});
    }
}

describe('Reconnecting', () => {
    it('Should wait a random time below a ceiling that doubles from 1 s to 30 s', () => {
        const pikoman = start();
        const waits: number[] = [];
        for (let n = 0; n < 8; n++) {
            const before = FakeWebSocket.all.length;
            last().drop();
            // Just short of the wait: no new socket yet; at the wait: one.
            const ceiling = Math.min(30000, 1000 * 2 ** n);
            const wait = Math.floor(0.999 * ceiling);
            jest.advanceTimersByTime(wait - 1);
            expect(FakeWebSocket.all.length).toBe(before);
            jest.advanceTimersByTime(1);
            expect(FakeWebSocket.all.length).toBe(before + 1);
            waits.push(wait);
        }
        expect(waits).toEqual([999, 1998, 3996, 7992, 15984, 29970, 29970, 29970]);
        expect(live()).toHaveLength(1);
        expect(pikoman.isConnected()).toBe(false);
    });

    it('Should spread the waits out (full jitter), and start over once a connection has lasted 30 s', () => {
        start();
        random.mockReturnValue(0);
        last().drop();
        jest.advanceTimersByTime(0);
        expect(FakeWebSocket.all).toHaveLength(2);

        // The second wait is below 2 s: half of it is 1 s.
        random.mockReturnValue(0.5);
        last().drop();
        jest.advanceTimersByTime(999);
        expect(FakeWebSocket.all).toHaveLength(2);
        jest.advanceTimersByTime(1);
        expect(FakeWebSocket.all).toHaveLength(3);

        // Connected again, for 30 s: the next wait is below 1 s, not below 4 s.
        last().accept('c_2');
        stayConnected(30000);
        random.mockReturnValue(0.999);
        last().drop();
        jest.advanceTimersByTime(999);
        expect(FakeWebSocket.all).toHaveLength(4);
    });

    it('Should not start over for connections that end within 30 s: a crash loop, or a kick', () => {
        start();
        for (let n = 0; n < 5; n++) {
            // Connected, up for a while (at most 29 s), then closed by the server (1008: a kick).
            last().accept(`c_${n}`);
            stayConnected(n === 4 ? 29000 : 0);
            const before = FakeWebSocket.all.length;
            last().drop(1008);
            // The ceiling keeps doubling: 1, 2, 4, 8, 16 s.
            const wait = Math.floor(0.999 * (1000 * 2 ** n));
            jest.advanceTimersByTime(wait - 1);
            expect(FakeWebSocket.all.length).toBe(before);
            jest.advanceTimersByTime(1);
            expect(FakeWebSocket.all.length).toBe(before + 1);
        }
    });

    it('Should be online from connected, not from the socket opening, so offline comes once', () => {
        const pikoman = start();
        const offline = jest.fn();
        pikoman.offline(offline);
        last().open();
        expect(pikoman.getStatus()).not.toBe(ConnectionStatus.Online);
        last().receive({op: 'connected', id: 'c_1'});
        expect(pikoman.getStatus()).toBe(ConnectionStatus.Online);
        last().drop();
        expect(offline).toHaveBeenCalledTimes(1);

        // The next socket opens, but closes before the server says connected: not a second offline.
        jest.advanceTimersToNextTimer();
        last().open();
        expect(pikoman.getStatus()).toBe(ConnectionStatus.Offline);
        last().drop();
        expect(offline).toHaveBeenCalledTimes(1);
    });

    it('Should call offline once for a lost connection, not for every attempt after it', () => {
        const pikoman = start();
        const offline = jest.fn();
        const online = jest.fn();
        pikoman.offline(offline);
        pikoman.online(online);
        last().accept('c_1');
        for (let n = 0; n < 3; n++) {
            last().drop();
            // The wait before the next attempt is the only timer.
            expect(jest.getTimerCount()).toBe(1);
            jest.advanceTimersToNextTimer();
        }
        expect(offline).toHaveBeenCalledTimes(1);
        last().accept('c_2');
        expect(online).toHaveBeenCalledTimes(2);
        last().drop();
        expect(offline).toHaveBeenCalledTimes(2);
    });

    it('Should never have two sockets, so an event never arrives twice', () => {
        const pikoman = start();
        last().accept('c_1');
        const channel = pikoman.listen('orders');
        const shipped = jest.fn();
        channel.on('order-shipped', shipped);

        // The old bug: a silent connection and its close both started an attempt, and the socket
        // given up on kept its handlers. Silence first, then the old socket's own close.
        const first = last();
        jest.advanceTimersByTime(18500);
        expect(first.closed).toBe(true);
        first.drop();
        jest.advanceTimersByTime(30000);
        expect(live()).toHaveLength(1);

        // An attempt that hangs is closed when the next one starts, and can no longer deliver.
        const hanging = last();
        jest.advanceTimersByTime(18500 + 30000);
        expect(hanging.closed).toBe(true);
        expect(live()).toHaveLength(1);

        last().accept('c_2');
        expect(last().sent).toContainEqual({op: 'join', channel: 'orders'});
        for (const ws of FakeWebSocket.all) {
            ws.receive({op: 'event', channel: 'orders', event: 'order-shipped', data: {id: 1}});
        }
        expect(shipped.mock.calls).toEqual([[{id: 1}]]);

        // A late close from a socket given up on starts nothing.
        const sockets = FakeWebSocket.all.length;
        first.onclose?.({code: 1006});
        hanging.drop();
        jest.advanceTimersByTime(5000);
        expect(FakeWebSocket.all.length).toBe(sockets);
        expect(pikoman.isConnected()).toBe(true);
    });

    it('Should not reconnect after 4403', () => {
        const pikoman = start();
        const revoked = jest.fn();
        pikoman.revoked(revoked);
        last().accept('c_1');
        last().drop(4403);
        jest.advanceTimersByTime(120000);
        expect(FakeWebSocket.all).toHaveLength(1);
        expect(revoked).toHaveBeenCalledTimes(1);
    });
});

describe('close()', () => {
    it('Should close for good: no reconnect, no timers, no callbacks, no page listeners', () => {
        const added = jest.spyOn(window, 'addEventListener');
        const removed = jest.spyOn(window, 'removeEventListener');
        try {
            const pikoman = start();
            const offline = jest.fn();
            pikoman.offline(offline);
            last().accept('c_1');
            const shipped = jest.fn();
            pikoman.listen('orders').on('order-shipped', shipped);
            const socket = last();

            pikoman.close();
            expect(socket.closed).toBe(true);
            expect(pikoman.isConnected()).toBe(false);
            expect(jest.getTimerCount()).toBe(0);

            // The page's listeners are the ones it added.
            for (const name of ['pagehide', 'pageshow']) {
                const listener = added.mock.calls.find(([event]) => event === name)?.[1];
                expect(listener).toBeDefined();
                expect(removed).toHaveBeenCalledWith(name, listener);
            }

            // Nothing that happens after reaches the app or opens a socket.
            socket.receive({op: 'event', channel: 'orders', event: 'order-shipped', data: {id: 1}});
            socket.drop();
            window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted: true}));
            jest.advanceTimersByTime(120000);
            expect(FakeWebSocket.all).toHaveLength(1);
            expect(shipped).not.toHaveBeenCalled();
            expect(offline).not.toHaveBeenCalled();
            expect(pikoman.send({op: 'ping'})).toBe(false);
        } finally {
            added.mockRestore();
            removed.mockRestore();
        }
    });

    it('Should close while a reconnect is waiting, and stop the wait', () => {
        const pikoman = start();
        last().drop();
        expect(jest.getTimerCount()).toBe(1);
        pikoman.close();
        expect(jest.getTimerCount()).toBe(0);
        jest.advanceTimersByTime(60000);
        expect(FakeWebSocket.all).toHaveLength(1);
    });

    it('Should connect again at once when a page comes back from the back/forward cache', () => {
        start();
        last().accept('c_1');
        const before = last();
        window.dispatchEvent(new Event('pagehide'));
        expect(before.closed).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
        window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted: true}));
        expect(FakeWebSocket.all).toHaveLength(2);
        expect(live()).toHaveLength(1);
    });

    it('Should tell the app, as for a new page, how connecting goes after the back/forward cache', () => {
        const pikoman = start();
        const online = jest.fn();
        const offline = jest.fn();
        pikoman.online(online);
        pikoman.offline(offline);
        last().accept('c_1');
        // Hidden: nothing is said, so the app last heard online.
        window.dispatchEvent(new Event('pagehide'));
        window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted: true}));
        last().drop();
        expect(offline).toHaveBeenCalledTimes(1);
        jest.advanceTimersToNextTimer();
        last().accept('c_2');
        expect(online).toHaveBeenCalledTimes(2);
    });
});

describe('A callback that throws', () => {
    it('Should not stop the reconnect or the other callbacks, and is thrown again on its own', () => {
        const pikoman = start();
        const next = jest.fn();
        pikoman.offline(() => {
            throw new Error('offline broke');
        });
        pikoman.offline(next);
        last().accept('c_1');
        last().drop();
        expect(next).toHaveBeenCalledTimes(1);
        // Thrown from a timer of its own, as from any event handler.
        expect(() => jest.advanceTimersByTime(0)).toThrow('offline broke');
        jest.advanceTimersByTime(999);
        expect(FakeWebSocket.all).toHaveLength(2);
    });

    it('Should not keep the channels from joining again', () => {
        const pikoman = start();
        pikoman.listen('orders');
        pikoman.online(() => {
            throw new Error('online broke');
        });
        last().accept('c_1');
        expect(last().sent).toEqual([{op: 'join', channel: 'orders'}]);
        expect(pikoman.isConnected()).toBe(true);
        expect(() => jest.advanceTimersByTime(0)).toThrow('online broke');
    });

    it('Should find the library done with its own step when the app is told', () => {
        const pikoman = start();
        pikoman.listen('orders');
        const seen: any[] = [];
        pikoman.online(() => seen.push(['online', [...last().sent]]));
        pikoman.offline(() => seen.push(['offline', jest.getTimerCount()]));
        last().accept('c_1');
        last().drop();
        // The joins were sent before online, and the reconnect was waiting before offline.
        expect(seen).toEqual([['online', [{op: 'join', channel: 'orders'}]], ['offline', 1]]);
    });

    it('Should still stay offline after 4403, and call revoked', () => {
        const pikoman = start();
        const revoked = jest.fn();
        pikoman.offline(() => {
            throw new Error('offline broke');
        });
        pikoman.revoked(revoked);
        last().accept('c_1');
        last().drop(4403);
        expect(revoked).toHaveBeenCalledTimes(1);
        expect(() => jest.advanceTimersByTime(0)).toThrow('offline broke');
        jest.advanceTimersByTime(120000);
        expect(FakeWebSocket.all).toHaveLength(1);
    });

    it('Should not stop a channel: the other handlers run, and it joins again after key_revoked', () => {
        const pikoman = start();
        last().accept('c_1');
        const channel = pikoman.listen('orders');
        const next = jest.fn();
        const any = jest.fn();
        channel.on('shipped', () => {
            throw new Error('handler broke');
        });
        channel.on('shipped', next);
        channel.serverMessage(any);
        channel.refused(() => {
            throw new Error('refused broke');
        });
        last().receive({op: 'event', channel: 'orders', event: 'shipped', data: 1});
        expect(next).toHaveBeenCalledWith(1);
        expect(any).toHaveBeenCalledWith(1, 'shipped');
        expect(() => jest.advanceTimersByTime(0)).toThrow('handler broke');

        last().receive({op: 'error', channel: 'orders', code: 'key_revoked'});
        expect(() => jest.advanceTimersByTime(0)).toThrow('refused broke');
        jest.advanceTimersByTime(1000);
        expect(last().sent.filter((message) => message.op === 'join')).toHaveLength(2);
    });
});
