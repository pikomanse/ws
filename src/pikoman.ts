import { Channel, PresenceChannel } from "./channel";
import { splitn } from "./helpers";
import {
	Authenticator,
	ConnectionStatus,
	Fn,
	MessageType,
	Options,
} from "./types";
import { OpCodeHandler } from "./opcode_handler";
import { HttpAuthenticator } from "./authenticators";

const defaultOptions: Options = {
	ws_address: "wss://ws.pikoman.se",
};
export default class Pikoman {
	private readonly appId: string;
	private clientId: string = "";
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

	public getStatus() {
		return this.status;
	}

	public getOptions() {
		return this.options;
	}

	public setOptions(options: Options) {
		this.options = options;
	}

	public getAuthUrl() {
		if (!this.options) {
			throw new Error("No auth_url");
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

	private onMessage({ data }: { data: string }) {
		const [opcodeStr, second, rest] = splitn(data, ":", 3);
		const opcode = parseInt(opcodeStr, 10);
		switch (opcode) {
			case MessageType.Connection: {
				this.client(second);
				break;
			}
			case MessageType.Ping: {
				this.clearOfflineTimeout();
				break;
			}
			default: {
				const channel = this.channels.get(second);
				if (channel) channel.dispatch(opcode, rest);
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
		this.timeoutSendPing = setTimeout(this.sendPing, 6500);
	}

	private sendPing() {
		this.send(`64:${new Date().getTime()}`);
	}

	getClientId(): string {
		return this.clientId;
	}

	state(fn: Fn) {
		this.messages.on(
			ConnectionStatus.Offline |
				ConnectionStatus.Loading |
				ConnectionStatus.Online,
			fn,
		);
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
		return this.ws.readyState === WebSocket.OPEN && this.clientId !== "";
	}

	listen(channelName: string): Channel {
		if (channelName.startsWith("presence-")) {
			throw new Error(
				`Presence channels should be listened to using the listenPresence method`,
			);
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

	listenPresence(
		channelName: string,
		authenticator: Authenticator = new HttpAuthenticator(),
	): PresenceChannel {
		if (!channelName.startsWith("presence-")) {
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

	leaveChannel(channelName: string) {
		const existingChannel = this.channels.get(channelName);
		if (existingChannel) {
			this.channels.delete(channelName);
			existingChannel.leave();
			existingChannel.clear();
		}
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

