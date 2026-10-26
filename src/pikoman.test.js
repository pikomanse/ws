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

  it('Should send client events named client-…, with echo for toAll', async () => {
    const {pikoman, socket} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    await flush();
    channel.send('vote', 5, true);
    channel.send('typing');
    // A name that already has the prefix keeps it, once.
    channel.send('client-cursor', {x: 1});
    expect(socket.sent.slice(1)).toEqual([
      {op: 'send', channel: 'presence-room', event: 'client-vote', data: 5, echo: true},
      {op: 'send', channel: 'presence-room', event: 'client-typing', data: null, echo: false},
      {op: 'send', channel: 'presence-room', event: 'client-cursor', data: {x: 1}, echo: false},
    ]);
    expect(() => channel.send('')).toThrow(/name/);
    expect(() => channel.send(undefined)).toThrow(/name/);
    expect(socket.sent).toHaveLength(4);
  });

  it('Should hand client events to onClient(event) with the sender', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const onVote = sinon.spy();
    const onVoteByFullName = sinon.spy();
    const onPrefixed = sinon.spy();
    const onClientMessage = sinon.spy();
    channel.onClient('vote', onVote);
    channel.onClient('client-vote', onVoteByFullName);
    channel.on('client-vote', onPrefixed);
    channel.clientMessage(onClientMessage);
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'client-vote', data: 5});
    expect(onVote.args).toEqual([['c_ola', 5]]);
    expect(onVoteByFullName.args).toEqual([['c_ola', 5]]);
    expect(onPrefixed.args).toEqual([['c_ola', 5]]);
    expect(onClientMessage.args).toEqual([['c_ola', 'client-vote', 5]]);

    channel.offClient('vote', onVote);
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'client-vote', data: 6});
    expect(onVote.callCount).toBe(1);
    expect(onVoteByFullName.callCount).toBe(2);
  });

  it('Should keep client events and published events apart, whatever a member names an event', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const published = sinon.spy();
    const fromMembers = sinon.spy();
    channel.on('order-shipped', published);
    channel.onClient('order-shipped', fromMembers);
    // From the backend: on(name) only.
    receive({op: 'event', channel: 'presence-room', event: 'order-shipped', data: {id: 1}});
    // From a member, named like a published event (an older client sends names as they are):
    // it arrives as client-order-shipped and never reaches the handler for the published one.
    receive({op: 'client_event', channel: 'presence-room', from: 'c_eve', event: 'order-shipped', data: {id: 666}});
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'client-order-shipped', data: {id: 2}});
    expect(published.args).toEqual([[{id: 1}]]);
    expect(fromMembers.args).toEqual([['c_eve', {id: 666}], ['c_ola', {id: 2}]]);
  });

  it('Should send to one member, by connection or by user, and never to nobody', () => {
    const {pikoman, socket} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    socket.sent.length = 0;
    channel.sendTo('c_ola', 'answer', {n: 1});
    channel.sendTo({userId: '42'}, 'client-answer');
    expect(socket.sent).toEqual([
      {op: 'send', channel: 'presence-room', event: 'client-answer', data: {n: 1}, echo: false, to: 'c_ola'},
      {op: 'send', channel: 'presence-room', event: 'client-answer', data: null, echo: false, to_user: '42'},
    ]);
    expect(() => channel.sendTo('', 'answer')).toThrow('sendTo needs');
    expect(() => channel.sendTo({userId: ''}, 'answer')).toThrow('sendTo needs');
    expect(() => channel.sendTo({}, 'answer')).toThrow('sendTo needs');
    expect(socket.sent.length).toBe(2);
  });

  it('Should kick a member as a bot, and check what it sends', () => {
    const {pikoman, socket} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    socket.sent.length = 0;
    channel.kick('c_ola');
    channel.kick({userId: '42'}, {reason: 'spam', banSeconds: 600});
    expect(socket.sent).toEqual([
      {op: 'kick', channel: 'presence-room', to: 'c_ola'},
      {op: 'kick', channel: 'presence-room', to_user: '42', reason: 'spam', ban_seconds: 600},
    ]);
    expect(() => channel.kick('')).toThrow('kick needs');
    expect(() => channel.kick('c_ola', {banSeconds: 1.5})).toThrow('banSeconds');
    expect(() => channel.kick('c_ola', {banSeconds: 86401})).toThrow('banSeconds');
    expect(() => channel.kick('c_ola', {reason: 'å'.repeat(101)})).toThrow('reason');
    expect(socket.sent.length).toBe(2);
  });

  it('Should tell a kicked member why, and not join that channel again on reconnect', async () => {
    const {pikoman, socket, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    pikoman.listen('news');
    receive({op: 'members', channel: 'presence-room', members: {c_me: {}, c_bo: {}}});
    const kicked = sinon.spy();
    const refused = sinon.spy();
    channel.kicked(kicked);
    channel.refused(refused);
    receive({op: 'kicked', channel: 'presence-room', reason: 'spam', ban_seconds: 60});
    receive({op: 'left', channel: 'presence-room'});
    expect(kicked.args).toEqual([[{reason: 'spam', banSeconds: 60}]]);
    expect(channel.getMembers().size).toBe(0);
    expect(pikoman.hasChannel(channel)).toBe(false);
    // A new connection joins news again, and not the room.
    socket.sent.length = 0;
    receive({op: 'connected', id: 'c_new'});
    await flush();
    expect(socket.sent).toEqual([{op: 'join', channel: 'news'}]);
    // Listening again rejoins; a ban answers banned.
    const again = pikoman.listenPresence('presence-room', tokenAuthenticator);
    again.refused(refused);
    receive({op: 'error', code: 'banned', channel: 'presence-room'});
    expect(refused.args).toEqual([['banned']]);
  });

  it('Should tell a handler what the server says about a direct message and its sender', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const asked = sinon.spy();
    const pushed = sinon.spy();
    const every = sinon.spy();
    channel.onClient('ask', asked);
    channel.on('missed', pushed);
    channel.clientMessage(every);
    receive({op: 'client_event', channel: 'presence-room', from: 'c_anna', user_id: '7', event: 'client-ask', data: 1, direct: true});
    receive({op: 'client_event', channel: 'presence-room', from: 'c_bot', bot: 'k_1', event: 'client-ask', data: 2});
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'client-ask', data: 3});
    receive({op: 'event', channel: 'presence-room', event: 'missed', data: [1], direct: true});
    receive({op: 'event', channel: 'presence-room', event: 'missed', data: [2]});
    expect(asked.args).toEqual([
      ['c_anna', 1, {direct: true, userId: '7'}],
      ['c_bot', 2, {direct: false, bot: 'k_1'}],
      ['c_ola', 3],
    ]);
    expect(every.args[0]).toEqual(['c_anna', 'client-ask', 1, {direct: true, userId: '7'}]);
    expect(pushed.args).toEqual([[[1], {direct: true}], [[2]]]);
  });

  it('Should catch every event with AllEvents', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    channel.setEventsHandler(new AllEvents());
    const all = sinon.spy();
    channel.on('anything', all);
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'client-vote', data: 5});
    receive({op: 'client_event', channel: 'presence-room', from: 'c_ola', event: 'vote', data: 6});
    expect(all.args).toEqual([['c_ola', 'client-vote', 5], ['c_ola', 'client-vote', 6]]);
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

  it('Should know which members are bots from the server list, not from member data', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    receive({
      op: 'members',
      channel: 'presence-room',
      members: {c_anna: {name: 'Anna', bot: true}, c_bot: {name: 'Order bot'}},
      bots: {c_bot: 'k_3f9a1c0e5b7d2468'},
    });
    // Member data is passed on exactly as the app made it.
    expect(channel.getMember('c_anna')).toEqual({name: 'Anna', bot: true});
    expect(channel.getMember('c_bot')).toEqual({name: 'Order bot'});
    // Anna's "bot": true is only her app data: she is not a bot.
    expect(channel.isBot('c_anna')).toBe(false);
    expect(channel.botKey('c_anna')).toBeUndefined();
    expect(channel.isBot('c_bot')).toBe(true);
    expect(channel.botKey('c_bot')).toBe('k_3f9a1c0e5b7d2468');
    expect([...channel.getBots()]).toEqual([['c_bot', 'k_3f9a1c0e5b7d2468']]);
  });

  it('Should have no bots when members has no bots', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    receive({op: 'members', channel: 'presence-room', members: {c_bot: {}}, bots: {c_bot: 'k_1'}});
    receive({op: 'members', channel: 'presence-room', members: {c_anna: {name: 'Anna'}}});
    expect(channel.getBots().size).toBe(0);
    expect(channel.isBot('c_bot')).toBe(false);
  });

  it('Should add a bot on member_joined with bot, and not without it', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const clients = sinon.spy();
    channel.clients(clients);
    receive({op: 'members', channel: 'presence-room', members: {}});

    receive({op: 'member_joined', channel: 'presence-room', count: 1, id: 'c_bot', data: {name: 'Order bot'}, bot: 'k_3f9a1c0e5b7d2468'});
    receive({op: 'member_joined', channel: 'presence-room', count: 2, id: 'c_anna', data: {name: 'Anna', bot: true}});

    expect(channel.getMember('c_bot')).toEqual({name: 'Order bot'});
    expect(channel.botKey('c_bot')).toBe('k_3f9a1c0e5b7d2468');
    expect(channel.getMember('c_anna')).toEqual({name: 'Anna', bot: true});
    expect(channel.isBot('c_anna')).toBe(false);
    // The callbacks keep their shape: the data as received, nothing merged into it.
    expect(clients.args).toEqual([
      [MessageType.Subscribe, 1, 'c_bot', {name: 'Order bot'}],
      [MessageType.Subscribe, 2, 'c_anna', {name: 'Anna', bot: true}],
    ]);
  });

  it('Should know a bot is a bot inside the join callback', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    const seen = [];
    channel.subscribe((_type, _count, id) => seen.push([id, channel.botKey(id)]));
    receive({op: 'member_joined', channel: 'presence-room', count: 1, id: 'c_bot', data: {}, bot: 'k_1'});
    receive({op: 'member_joined', channel: 'presence-room', count: 2, id: 'c_anna', data: {}});
    expect(seen).toEqual([['c_bot', 'k_1'], ['c_anna', undefined]]);
  });

  it('Should forget a bot when it leaves', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    receive({op: 'members', channel: 'presence-room', members: {c_bot: {name: 'Order bot'}}, bots: {c_bot: 'k_1'}});
    receive({op: 'member_left', channel: 'presence-room', count: 0, id: 'c_bot'});
    expect(channel.getMember('c_bot')).toBeUndefined();
    expect(channel.isBot('c_bot')).toBe(false);
    expect(channel.getBots().size).toBe(0);
  });

  it('Should tell whether a client event came from a bot', () => {
    const {pikoman, receive} = connect();
    const channel = pikoman.listenPresence('presence-room', tokenAuthenticator);
    receive({
      op: 'members',
      channel: 'presence-room',
      members: {c_anna: {name: 'Anna', bot: true}, c_bot: {name: 'Order bot'}},
      bots: {c_bot: 'k_1'},
    });
    const fromBot = [];
    channel.onClient('status', (from, data) => fromBot.push([from, channel.isBot(from), data]));
    receive({op: 'client_event', channel: 'presence-room', from: 'c_bot', event: 'client-status', data: 'shipped'});
    receive({op: 'client_event', channel: 'presence-room', from: 'c_anna', event: 'client-status', data: 'shipped'});
    expect(fromBot).toEqual([['c_bot', true, 'shipped'], ['c_anna', false, 'shipped']]);
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
