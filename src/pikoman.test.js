import Pikoman from './pikoman';
import sinon from 'sinon';
import {AllEvents} from './channel';
import {MessageType} from './types';

/** Stands in for the browser's WebSocket, so no test touches the network. */
class FakeWebSocket {
  static OPEN = 1;
  static last = null;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    FakeWebSocket.last = this;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {}
}

const realWebSocket = global.WebSocket;
beforeEach(() => {
  global.WebSocket = FakeWebSocket;
  jest.useFakeTimers();
});
afterEach(() => {
  global.WebSocket = realWebSocket;
  jest.useRealTimers();
});

function connect(id = 'c_me') {
  const pikoman = new Pikoman('app-test', {ws_address: 'ws://localhost'});
  const socket = FakeWebSocket.last;
  const receive = (message) => pikoman.onMessage({data: JSON.stringify(message)});
  receive({op: 'connected', id});
  return {pikoman, socket, receive};
}

const tokenAuthenticator = {authenticate: async (clientId, channel) => `token-${clientId}-${channel}`};
const flush = () => new Promise(jest.requireActual('timers').setImmediate);

describe('Pikoman', () => {
  it('Should connect to the app and know its id', () => {
    const {pikoman, socket} = connect();
    expect(socket.url).toBe('ws://localhost/app-test');
    expect(pikoman.getClientId()).toBe('c_me');
    expect(pikoman.isConnected()).toBe(true);
  });

  it('Should join public channels without a token', () => {
    const {pikoman, socket} = connect();
    pikoman.listen('events');
    expect(socket.sent).toEqual([{op: 'join', channel: 'events'}]);
  });

  it('Should join channels created before it connected, once it knows its id', () => {
    const pikoman = new Pikoman('app-test', {ws_address: 'ws://localhost'});
    const socket = FakeWebSocket.last;
    pikoman.listen('events');
    expect(socket.sent).toEqual([]);
    pikoman.onMessage({data: JSON.stringify({op: 'connected', id: 'c_me'})});
    expect(socket.sent).toEqual([{op: 'join', channel: 'events'}]);
  });

  it('Should refuse protected channels in listen', () => {
    const {pikoman} = connect();
    expect(() => pikoman.listen('presence-room')).toThrow();
    expect(() => pikoman.listen('private-user-1')).toThrow();
    expect(() => pikoman.listenPrivate('events')).toThrow();
  });

  it('Should hand published events to on() and serverMessage()', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listen('events');
    const onShipped = sinon.spy();
    const onAny = sinon.spy();
    channel.on('shipped', onShipped);
    channel.serverMessage(onAny);
    receive({op: 'event', channel: 'events', event: 'shipped', data: {id: 1042}});
    receive({op: 'event', channel: 'events', data: 'no name'});
    receive({op: 'event', channel: 'other', event: 'shipped', data: {}});
    expect(onShipped.args).toEqual([[{id: 1042}]]);
    expect(onAny.args).toEqual([[{id: 1042}, 'shipped'], ['no name', undefined]]);
  });

  it('Should send ping as JSON', () => {
    const {socket} = connect();
    jest.advanceTimersByTime(6500);
    expect(socket.sent).toContainEqual({op: 'ping'});
  });

  it('Should ignore messages that are not JSON', () => {
    const {pikoman} = connect();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    pikoman.onMessage({data: '2:events'});
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('Private and presence channels', () => {
  it('Should join with a token from the authenticator', async () => {
    const {pikoman, socket} = connect();
    pikoman.listenPrivate('private-user-1', tokenAuthenticator);
    await flush();
    expect(socket.sent).toEqual([{op: 'join', channel: 'private-user-1', token: 'token-c_me-private-user-1'}]);
  });

  it('Should tell refused() when the server refuses', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPrivate('private-user-1', tokenAuthenticator);
    const refused = sinon.spy();
    channel.refused(refused);
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    receive({op: 'error', code: 'join_refused', channel: 'private-user-1'});
    error.mockRestore();
    expect(refused.args).toEqual([['join_refused']]);
  });

  it('Should send client events with echo for toAll', async () => {
    const {pikoman, socket} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    await flush();
    channel.send('vote', 5, true);
    channel.send('typing');
    expect(socket.sent.slice(1)).toEqual([
      {op: 'send', channel: 'presence-room', event: 'vote', data: 5, echo: true},
      {op: 'send', channel: 'presence-room', event: 'typing', data: null, echo: false},
    ]);
  });

  it('Should hand client events to on(event) with the sender', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const onVote = sinon.spy();
    const onClientMessage = sinon.spy();
    channel.on('vote', onVote);
    channel.clientMessage(onClientMessage);
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'vote', data: 5});
    expect(onVote.args).toEqual([['c_ola', 5]]);
    expect(onClientMessage.args).toEqual([['c_ola', 'vote', 5]]);
  });

  it('Should catch every event with AllEvents', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    channel.setEventsHandler(new AllEvents());
    const all = sinon.spy();
    channel.on('anything', all);
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'vote', data: 5});
    expect(all.args).toEqual([['c_ola', 'vote', 5]]);
  });

  it('Should keep the member list', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const clients = sinon.spy();
    const members = sinon.spy();
    channel.clients(clients);
    channel.members(members);

    receive({op: 'members', channel: 'presence-room', members: {c_me: {name: 'Me'}, c_anna: {name: 'Anna'}}});
    expect(channel.me).toEqual({name: 'Me'});
    expect(channel.getMembers().size).toBe(2);

    receive({op: 'member_joined', channel: 'presence-room', count: 3, id: 'c_ola', data: {name: 'Ola'}});
    expect(channel.getMember('c_ola')).toEqual({name: 'Ola'});

    receive({op: 'member_left', channel: 'presence-room', count: 2, id: 'c_anna'});
    expect(channel.getMember('c_anna')).toBeUndefined();

    expect(clients.args).toEqual([
      [MessageType.Subscribe, 3, 'c_ola', {name: 'Ola'}],
      [MessageType.Unsubscribe, 2, 'c_anna'],
    ]);
    expect(members.callCount).toBe(3);
  });

  it('Should join again with a new token after reconnecting', async () => {
    const {pikoman, socket, receive} = connect('c_first');
    pikoman.listenPresence('presence-room', tokenAuthenticator);
    await flush();
    receive({op: 'connected', id: 'c_second'});
    await flush();
    expect(socket.sent.map((message) => message.token)).toEqual([
      'token-c_first-presence-room',
      'token-c_second-presence-room',
    ]);
  });
});
