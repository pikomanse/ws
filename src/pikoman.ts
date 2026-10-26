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
import { checkAppId, checkedAddress } from "./names";
import { inBrowser } from "./redact";

const defaultOptions: Options = {
	// 2.0 runs on next.pikoman.se until ws.pikoman.se switches over; 1.0.0 goes back to ws.pikoman.se.
	ws_address: "wss://next.pikoman.se",
};

/**
 * Outside a browser (a bot, a backend, a script) the websocket address must be `wss://`, or
 * `ws://` to localhost: a typo would otherwise send join tokens and messages in the clear. In a
 * page, the page's own scheme already decides, and a dev server on another machine may use ws://.
 */
function checkedOptions(options: Options): Options {
	if (!inBrowser() && options.ws_address) {
		return { ...options, ws_address: checkedAddress(options.ws_address, "wss", "ws") };
	}
	return options;
}

/**
 * Reconnecting waits a random time below a ceiling that starts at 1 s and doubles with every
 * attempt that fails, up to 30 s ("full jitter"), so clients that lost the server at the same
 * moment come back spread out instead of all at once.
 */
const RECONNECT_FIRST_MS = 1000;
const RECONNECT_MAX_MS = 30000;
/**
 * A connection that lasts this long counts as working: the ceiling starts over from 1 s. Not at
 * `connected` itself, or a server in a crash loop, or one that closes connections right after
 * `connected` (1008, 4429), would get every client back within a second each time.
 */
const STABLE_MS = 30000;
/** Quiet for this long: ask the server for a pong. */
const PING_AFTER_MS = 6500;
/**
 * Nothing heard for this long, not even a pong (or, for a new socket, `connected`): the
 * connection is dead, or never got through. The socket is closed and another one tried.
 */
const SILENCE_MS = 18500;

export default class Pikoman {
	private readonly appId: string;
	private clientId: string = "";
	private timeoutOffline: any = 0;
	private timeoutSendPing: any = 0;
	private timeoutReconnect: any = 0;
	private timeoutStable: any = 0;
	/** Attempts since the last connection that lasted STABLE_MS: how long the next wait may be. */
	private attempts = 0;
	/**
	 * Set by close(), by close code 4403 (the connection's API key was deleted) and by 4401 (the
	 * app disconnected it): no reconnect.
	 */
	private closedForGood = false;
	private status = ConnectionStatus.Loading;
	private channels = new Map<string, Channel>();
	private messages = new OpCodeHandler<ConnectionStatus>(this);
	private options: Options = defaultOptions;
	/**
	 * The one socket this client listens to, open or still connecting. A socket it gives up on is
	 * closed and its handlers removed before another is made, so two can never deliver events.
	 */
	private ws?: WebSocket;
	// Leaving the page (a link, the back button) can keep it in the browser's back/forward cache
	// with the socket open, so presence channels would still count this visitor until the server
	// drops the silent connection. Close it on the way out, and connect again at once if the page
	// is shown from that cache. Switching tabs fires neither.
	private readonly onPageHide = () => this.closeQuietly();
	private readonly onPageShow = (event: Event) => {
		if (!(event as PageTransitionEvent).persisted || this.closedForGood) return;
		// The app heard nothing when the page was hidden. As for a new page, it hears `online` once
		// connected, or `offline` if that fails.
		this.status = ConnectionStatus.Loading;
		this.connect();
	};

	constructor(appId: string, options = defaultOptions) {
		this.appId = checkAppId(appId);
		this.options = checkedOptions({
			...defaultOptions,
			...options,
		});
		// Bound, so they work however they are called: as callbacks, or through a proxy such as a
		// Solid store, which would drop what close() writes.
		this.send = this.send.bind(this);
		this.sendPing = this.sendPing.bind(this);
		this.close = this.close.bind(this);
		this.connect();
		if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
			window.addEventListener("pagehide", this.onPageHide);
			window.addEventListener("pageshow", this.onPageShow);
		}
	}

	public getStatus() {
		return this.status;
	}

	public getOptions() {
		return this.options;
	}

	public setOptions(options: Options) {
		this.options = checkedOptions(options);
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

	/**
	 * Forgets a channel the server took away for good (a kick), without sending `leave`: it is not
	 * joined again on reconnect. Only that channel object, not one that replaced it.
	 */
	forgetChannel(channel: Channel) {
		if (this.channels.get(channel.getName()) === channel) {
			this.channels.delete(channel.getName());
		}
	}

	/** Whether this channel object is still one the app has joined (not left or replaced). */
	hasChannel(channel: Channel): boolean {
		let found = false;
		this.channels.forEach((joined) => {
			if (joined === channel) found = true;
		});
		return found;
	}

	private rejoin() {
		this.channels.forEach((channel) => channel.join());
	}

	/** Opens a socket, after closing the one before it: never two at once. */
	private connect() {
		clearTimeout(this.timeoutReconnect);
		this.dropSocket();
		if (this.closedForGood) return;
		const ws = new WebSocket(this.getAppWsUrl());
		this.ws = ws;
		// Each handler checks that its socket is still the one: belt and braces, since a socket
		// given up on has no handlers left. The socket opening changes nothing: the connection is
		// online when the server says `connected`.
		ws.onmessage = (event: MessageEvent) => {
			if (ws === this.ws) this.onMessage(event);
		};
		ws.onclose = (event: CloseEvent) => {
			if (ws === this.ws) this.onClose(event);
		};
		// An error is always followed by a close, which is where it is handled.
		ws.onerror = null;
		this.watch();
	}

	/** Stops listening to the current socket and closes it. */
	private dropSocket() {
		const ws = this.ws;
		if (!ws) return;
		this.ws = undefined;
		ws.onopen = null;
		ws.onmessage = null;
		ws.onclose = null;
		ws.onerror = null;
		try {
			ws.close();
		} catch (e) {
			// Already closed, or never opened: nothing more to do.
		}
	}

	private stopTimers() {
		clearTimeout(this.timeoutOffline);
		clearTimeout(this.timeoutSendPing);
		clearTimeout(this.timeoutReconnect);
		clearTimeout(this.timeoutStable);
	}

	/**
	 * Closes the socket without the usual "lost the connection" handling, which would connect
	 * again: the page is being left, and a page shown again from the back/forward cache connects
	 * by itself (pageshow).
	 */
	private closeQuietly() {
		this.stopTimers();
		this.dropSocket();
		this.status = ConnectionStatus.Offline;
		this.clientId = "";
	}

	/**
	 * Closes the connection for good: it never reconnects, no callback is called again, every timer
	 * is stopped and the page listeners are removed, so nothing keeps the client alive. For a
	 * single-page app that no longer needs it (a view that goes away); a new `Pikoman` connects
	 * again. The server ends every membership when the socket closes.
	 */
	close() {
		this.closedForGood = true;
		this.closeQuietly();
		if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
			window.removeEventListener("pagehide", this.onPageHide);
			window.removeEventListener("pageshow", this.onPageShow);
		}
		this.channels.forEach((channel) => channel.clear());
		this.clear();
	}

	/** Waits a random time below the current ceiling (see RECONNECT_FIRST_MS), then connects. */
	private scheduleReconnect() {
		if (this.closedForGood) return;
		clearTimeout(this.timeoutReconnect);
		const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_FIRST_MS * 2 ** this.attempts);
		this.attempts = Math.min(this.attempts + 1, 16);
		this.timeoutReconnect = setTimeout(() => this.connect(), Math.floor(Math.random() * ceiling));
	}

	private onMessage({ data }: { data: string }) {
		let message: ServerMessage;
		try {
			message = JSON.parse(data);
		} catch (e) {
			console.error("Pikoman: could not read message from server");
			return;
		}
		this.watch();
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

	/**
	 * The server said `connected`: a new connection id, and the connection is online. Every channel
	 * joins again, with new tokens, before the app is told (`online`), so a callback that throws
	 * cannot keep the channels out, and one that joins a channel does not join it twice.
	 */
	private client(clientId: string) {
		this.clientId = clientId;
		this.status = ConnectionStatus.Online;
		clearTimeout(this.timeoutStable);
		this.timeoutStable = setTimeout(() => {
			this.attempts = 0;
		}, STABLE_MS);
		this.rejoin();
		this.messages.dispatch(ConnectionStatus.Online, [true]);
	}

	/** The current socket closed. */
	private onClose(event?: CloseEvent) {
		this.lost(event);
	}

	/**
	 * The socket closed, or went silent: let it go and connect again after a while (after 4403 or
	 * 4401, never), and only then tell the app, so a callback that throws cannot stop the reconnect. The
	 * app is told once per lost connection: not again for every attempt that fails after it, nor
	 * for a socket that opened and closed before `connected`.
	 */
	private lost(event?: CloseEvent) {
		this.stopTimers();
		this.dropSocket();
		this.clientId = "";
		const wasOffline = this.status === ConnectionStatus.Offline;
		this.status = ConnectionStatus.Offline;
		// 4403: the API key this connection signed in with was deleted. Connecting again would only
		// be refused again, so stay offline.
		const revoked = event?.code === 4403;
		// 4401: the app disconnected this connection (a moderator). Coming back by itself would undo it.
		const disconnected = event?.code === 4401;
		if (revoked || disconnected) {
			this.closedForGood = true;
		} else {
			this.scheduleReconnect();
		}
		if (!wasOffline) {
			this.messages.dispatch(ConnectionStatus.Offline, [false, event]);
		}
		if (revoked) {
			this.messages.dispatch(ConnectionStatus.Revoked, [event]);
		}
		if (disconnected) {
			this.messages.dispatch(ConnectionStatus.Disconnected, [event]);
		}
	}

	/** Heard from the server, or a new socket: ping after a quiet while, give up after a long one. */
	private watch() {
		clearTimeout(this.timeoutOffline);
		clearTimeout(this.timeoutSendPing);
		this.timeoutOffline = setTimeout(() => this.lost(), SILENCE_MS);
		this.timeoutSendPing = setTimeout(this.sendPing, PING_AFTER_MS);
	}

	private sendPing() {
		this.send({ op: "ping" });
	}

	getAppId(): string {
		return this.appId;
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

	/**
	 * The connection was lost: `fn(false, closeEvent)`, once. The client connects again after a
	 * random wait of up to 1 s, growing to up to 30 s while attempts fail, and starting over from
	 * 1 s once a connection has lasted 30 s.
	 */
	offline(fn: Fn) {
		this.messages.on(ConnectionStatus.Offline, fn);
	}

	/**
	 * The server closed the connection for good (4403): the API key it signed in with was deleted.
	 * It does not reconnect; `fn(closeEvent)` is the place to tell the user, or to start again with
	 * a new key. `offline` is called first, as for any close.
	 */
	revoked(fn: Fn) {
		this.messages.on(ConnectionStatus.Revoked, fn);
	}

	/**
	 * The app disconnected this connection (4401, `Rest.disconnect` with the right `disconnect`,
	 * from its backend or a bot). It does not reconnect; `fn(closeEvent)` is the place to tell the
	 * user. `offline` is called first, as for any close. Whether they may come back is the app's to
	 * decide: its backend signs their next token, or does not.
	 */
	disconnected(fn: Fn) {
		this.messages.on(ConnectionStatus.Disconnected, fn);
	}

	/** Whether channels join again by themselves after `key_revoked` (`Options.rejoin_on_revoke`). */
	rejoinsOnRevoke(): boolean {
		return this.options.rejoin_on_revoke !== false;
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
		return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN && this.clientId !== "";
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

	/** Sends a message if connected. Returns whether it was handed to the socket. */
	send(message: ClientMessage): boolean {
		if (this.isConnected()) {
			(this.ws as WebSocket).send(JSON.stringify(message));
			return true;
		}
		return false;
	}

	clear() {
		this.messages.clear();
		this.channels.clear();
	}
}
