import { Channel, EncryptedChannel, PresenceChannel, PrivateChannel } from "./channel";
import { isEncryptedChannel } from "./encryption";
import {
	Authenticator,
	ClientMessage,
	ConnectionStatus,
	Fn,
	Options,
	ServerMessage,
} from "./types";
import { OpCodeHandler } from "./opcode_handler";
import { HttpAuthenticator } from "./authenticators";

const defaultOptions: Options = {
	// 2.0 runs on next.pikoman.se until ws.pikoman.se switches over; 1.0.0 goes back to ws.pikoman.se.
	ws_address: "wss://next.pikoman.se",
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
		// Leaving the page (a link, the back button) can keep it in the browser's back/forward cache
		// with the socket open, so presence channels would still count this visitor until the server
		// drops the silent connection. Close it on the way out, and connect again at once if the page
		// is shown from that cache. Switching tabs fires neither.
		if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
			window.addEventListener("pagehide", () => this.closeQuietly());
			window.addEventListener("pageshow", (event) => {
				if ((event as PageTransitionEvent).persisted) this.reconnect(0);
			});
		}
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

	/**
	 * Closes the socket without the usual "lost the connection" handling, whose 5 s reconnect would
	 * otherwise run when a page comes back from the back/forward cache.
	 */
	private closeQuietly() {
		clearTimeout(this.timeoutOffline);
		clearTimeout(this.timeoutSendPing);
		clearTimeout(this.timeoutReconnect);
		this.ws.onclose = null;
		this.ws.onerror = null;
		this.ws.close();
		this.status = ConnectionStatus.Offline;
		this.clientId = "";
	}

	private reconnect(delay = 5000) {
		this.ws.close();
		clearTimeout(this.timeoutReconnect);
		this.timeoutReconnect = setTimeout(() => {
			const ws = new WebSocket(this.getAppWsUrl());
			ws.onopen = () => {
				this.ws = ws;
				this.bindWebSocket(ws);
				this.clearOfflineTimeout();
			};
			ws.onerror = () => this.reconnect();
		}, delay);
	}

	private onMessage({ data }: { data: string }) {
		let message: ServerMessage;
		try {
			message = JSON.parse(data);
		} catch (e) {
			console.error("Pikoman: could not read message from server");
			return;
		}
		this.clearOfflineTimeout();
		switch (message.op) {
			case "connected": {
				this.client(message.id);
				break;
			}
			case "pong": {
				break;
			}
			case "error": {
				const channel = message.channel ? this.channels.get(message.channel) : undefined;
				if (channel) {
					channel.handleError(message.code);
				} else {
					console.error(`Pikoman: ${message.code}`);
				}
				break;
			}
			default: {
				const channel = this.channels.get(message.channel);
				if (channel) {
					channel.handle(message);
				}
			}
		}
	}

	/** A new connection id: every channel joins again, with new tokens. */
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
		this.clientId = "";
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
		this.send({ op: "ping" });
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

	private addChannel<T extends Channel>(channelName: string, create: () => T): T {
		const existingChannel = this.channels.get(channelName);
		if (existingChannel) {
			return existingChannel as T;
		}
		const channel = create();
		this.channels.set(channelName, channel);
		if (this.isConnected()) {
			channel.join();
		}
		return channel;
	}

	listen(channelName: string): Channel {
		if (channelName.startsWith("presence-")) {
			throw new Error(
				`Presence channels should be listened to using the listenPresence method`,
			);
		}
		if (channelName.startsWith("private-")) {
			throw new Error(
				`Private channels should be listened to using the listenPrivate method`,
			);
		}
		return this.addChannel(channelName, () => new Channel(channelName, this));
	}

	/**
	 * Joins a `private-` channel with a token from the authenticator. A `private-encrypted-`
	 * channel gives an `EncryptedChannel`, which also needs a channel key from the authenticator.
	 */
	listenPrivate(
		channelName: string,
		authenticator: Authenticator = new HttpAuthenticator(),
	): PrivateChannel {
		if (!channelName.startsWith("private-")) {
			throw new Error(`Private channels must start with prefix private-`);
		}
		return this.addChannel(channelName, () =>
			isEncryptedChannel(channelName)
				? new EncryptedChannel(channelName, this, authenticator)
				: new PrivateChannel(channelName, this, authenticator),
		);
	}

	listenPresence(
		channelName: string,
		authenticator: Authenticator = new HttpAuthenticator(),
	): PresenceChannel {
		if (!channelName.startsWith("presence-")) {
			throw new Error(`Presence channels must start with prefix presence`);
		}
		return this.addChannel(
			channelName,
			() => new PresenceChannel(channelName, this, authenticator),
		);
	}

	leaveChannel(channelName: string) {
		const existingChannel = this.channels.get(channelName);
		if (existingChannel) {
			this.channels.delete(channelName);
			existingChannel.leave();
			existingChannel.clear();
		}
	}

	send(message: ClientMessage) {
		if (this.isConnected()) {
			this.ws.send(JSON.stringify(message));
		}
	}

	clear() {
		this.messages.clear();
		this.channels.clear();
	}
}
