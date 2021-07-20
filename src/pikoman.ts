import {Channel, PresenceChannel} from "./channel";
import {splitn} from "./helpers";
import {Authenticator, ConnectionStatus, Fn, MessageType, Options} from "./types";
import {OpCodeHandler} from "./opcode_handler";
import {HttpAuthenticator} from "./authenticators";

const defaultOptions: Options = {
    ws_address: 'wss://ws.pikoman.se',
};
export default class Pikoman {
    private readonly appId: string;
    private clientId: string = '';
    private timeoutOffline: any = 0;
    private timeoutSendPing: any = 0;
    private timeoutReconnect: any = 0;
    private status = ConnectionStatus.Loading;
    private channels = new Map<string, Channel>();
    private messages = new OpCodeHandler<ConnectionStatus>(this);
    private options: Options = defaultOptions;
    private ws: WebSocket;

    constructor(appId: string, options = defaultOptions) {
        this.appId = appId;
        this.options = {
            ...defaultOptions,
            ...options,
        };
        this.ws = new WebSocket(this.getAppWsUrl());
        this.send = this.send.bind(this);
        this.sendPing = this.sendPing.bind(this);
        this.onOffline = this.onOffline.bind(this);
        this.bindWebSocket(this.ws);
    }

    private bindWebSocket(ws: WebSocket) {
        ws.onopen = this.onOpen.bind(this);
        ws.onmessage = this.onMessage.bind(this);
        ws.onclose = this.onClose.bind(this);
        ws.onerror = this.onOffline.bind(this);
    }

    public getOptions() {
        return this.options;
    }

    public setOptions(options: Options) {
        this.options = options;
    }

    public getAuthUrl() {
        if (!this.options) {
            throw new Error('No auth_url');
        }
        return this.options.auth_url;
    }

    private getAppWsUrl() {
        return `${this.options.ws_address}/${this.appId}`;
    }

    private rejoin() {
        this.channels.forEach((channel) => channel.join());
    }

    private reconnect() {
        this.ws.close();
        clearTimeout(this.timeoutReconnect);
        this.timeoutReconnect = setTimeout(() => {
            const ws = new WebSocket(this.getAppWsUrl());
            ws.onopen = () => {
                this.ws = ws;
                this.bindWebSocket(ws);
                this.clearOfflineTimeout();
                this.rejoin();
            };
            ws.onerror = this.reconnect.bind(this);
        }, 5000);
    }

    private onMessage({data}: { data: string }) {
        switch (parseInt(data.substring(0, data.indexOf(':')), 10)) {
            case MessageType.Connection: {
                const [_opcode, clientId] = splitn(`${data}`, ':', 2);
                this.client(clientId);
                break;
            }
            case MessageType.ServerMessage: {
                const [_opcode, channelName, rest] = splitn(`${data}`, ':', 3);
                const channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatch(rest);
                break;
            }
            case MessageType.Subscribe: {
                const [_opcode, channelName, nrOfUsers, userId, userData] = splitn(`${data}`, ':', 5);
                const channel = this.channels.get(channelName) as PresenceChannel;
                if (!channel) {
                    return;
                }
                channel.addMember(userId, userData);
                channel.opcodes.dispatch(MessageType.Subscribe, [MessageType.Subscribe, parseInt(nrOfUsers, 10), userId, JSON.parse(userData)]);
                channel.opcodes.dispatch(MessageType.ClientsInChannel, [channel.getMembers()]);
                break;
            }
            case MessageType.Unsubscribe: {
                const [_opcode, channelName, nrOfUsers, userId] = splitn(`${data}`, ':', 4);
                const channel = this.channels.get(channelName) as PresenceChannel;
                if (!channel) {
                    return;
                }
                channel.removeMember(userId);
                channel.opcodes.dispatch(MessageType.Unsubscribe, [MessageType.Unsubscribe, parseInt(nrOfUsers, 10), userId]);
                channel.opcodes.dispatch(MessageType.ClientsInChannel, [channel.getMembers()]);
                break;
            }
            case MessageType.ClientMessage: {
                const [_opcode, channelName, rest] = splitn(`${data}`, ':', 3);
                const channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatchClient(rest);
                channel.opcodes.dispatch(MessageType.ClientMessage, [rest]);
                break;
            }
            case MessageType.ClientsInChannel: {
                const [_opcode, channelName, membersStr] = splitn(`${data}`, ':', 3);
                const channel = this.channels.get(channelName) as PresenceChannel;
                if (!channel) {
                    return;
                }
                const members = new Map(Object.entries(JSON.parse(membersStr)));
                channel.setMembers(members);
                channel.opcodes.dispatch(MessageType.ClientsInChannel, [members]);
                // TODO: Add wrapper around members that simplify this stuff.
                channel.opcodes.dispatch(MessageType.Subscribe, [MessageType.Subscribe, Array.from(channel.getMembers().keys()).length, this.getClientId(), JSON.parse(channel.getMember(this.getClientId()))]);
                break;
            }
            case MessageType.Ping: {
                this.clearOfflineTimeout();
                break;
            }
            default: {
                const [_opcode, channelName, rest] = splitn(`${data}`, ':', 3);
                const channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.opcodes.dispatch(MessageType.Unknown, [rest]);
            }
        }
    }

    private client(clientId: string) {
        this.clientId = clientId;
        this.messages.dispatch(ConnectionStatus.Online, [true]);
        this.clearOfflineTimeout();
        this.rejoin();
    }

    private onOpen() {
        this.status = ConnectionStatus.Online;
    }

    private onClose(...data: any[]) {
        this.status = ConnectionStatus.Offline;
        this.messages.dispatch(ConnectionStatus.Offline, [false, ...data]);
        this.reconnect();
    }

    private onOffline(...data: any[]) {
        this.onClose(data);
    }

    private clearOfflineTimeout() {
        clearTimeout(this.timeoutOffline);
        clearTimeout(this.timeoutSendPing);
        this.timeoutOffline = setTimeout(this.onOffline, 18500);
        this.timeoutSendPing = setTimeout(this.sendPing, 3500);
    }

    private sendPing() {
        this.send(`64:${new Date().getTime()}`);
    }

    getClientId(): string {
        return this.clientId;
    }

    state(fn: Fn) {
        this.messages.on(ConnectionStatus.Offline | ConnectionStatus.Loading | ConnectionStatus.Online, fn);
    }

    online(fn: Fn) {
        this.messages.on(ConnectionStatus.Online, fn);
    }

    connection(fn: Fn) {
        this.messages.on(ConnectionStatus.Offline | ConnectionStatus.Online, fn);
        if (this.isConnected()) {
            fn.call(this, [true]);
        }
    }

    offline(fn: Fn) {
        this.messages.on(ConnectionStatus.Offline, fn);
    }

    join(fn: Fn) {
        this.subscribe(fn);
    }

    subscribe(fn: Fn) {
        this.messages.on(ConnectionStatus.Online, fn);
        if (this.isConnected()) {
            fn.call(this, this.clientId);
        }
    }

    isConnected() {
        return this.ws.readyState === WebSocket.OPEN && this.clientId !== '';
    }

    listen(channelName: string): Channel {
        if (channelName.startsWith('presence-')) {
            throw new Error(`Presence channels should be listened to using the listenPresence method`);
        }
        const existingChannel = this.channels.get(channelName);
        if (existingChannel) {
            return existingChannel;
        }
        const channel = new Channel(channelName, this);
        this.channels.set(channelName, channel);
        if (this.isConnected()) {
            channel.join();
        }
        return channel;
    }

    listenPresence(channelName: string, authenticator: Authenticator = new HttpAuthenticator()): PresenceChannel {
        if (!channelName.startsWith('presence-')) {
            throw new Error(`Presence channels must start with prefix presence`);
        }
        const existingChannel = this.channels.get(channelName);
        if (existingChannel) {
            return existingChannel as PresenceChannel;
        }
        const channel = new PresenceChannel(channelName, this, authenticator);
        this.channels.set(channelName, channel);
        if (this.isConnected()) {
            channel.join();
        }
        return channel;
    }

    send(data: string) {
        if (this.isConnected()) {
            this.ws.send(data);
        }
    }

    clear() {
        this.messages.clear();
        this.channels.clear();
    }
}