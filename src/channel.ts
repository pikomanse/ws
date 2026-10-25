import Pikoman from "./pikoman";
import { Authenticator, ChannelMessage, ClientErrorCode, Fn, JoinAuthorization, MessageType } from "./types";
import { decryptEvent, encryptEvent, eventJson, importChannelKey } from "./encryption";
import { OpCodeHandler } from "./opcode_handler";
import { HttpAuthenticator } from "./authenticators";
import Topics from "./topics";

/** Calls `on(event, fn)` listeners with the event's data (and the sender, for client events). */
export class EventsHandler {
	private topics: Topics;

	constructor(context?: any) {
		this.topics = new Topics(context);
	}

	setContext(context?: any) {
		this.topics.setContext(context);
	}

	dispatchClient(event: string, from: string, data: any) {
		this.topics.dispatch(event, from, data);
		return this;
	}

	dispatch(event: string, data: any) {
		this.topics.dispatch(event, data);
		return this;
	}

	on(event: string, fn: Fn) {
		this.topics.on(event, fn);
		return this;
	}

	off(event: string, fn: Fn) {
		this.topics.off(event, fn);
		return this;
	}
}

/** Calls every listener for every event, whatever name it was registered with. */
export class AllEvents {
	private topics: Topics;
	private catchAllEvent = "all";

	constructor(context?: any) {
		this.topics = new Topics(context);
	}

	setContext(context?: any) {
		this.topics.setContext(context);
	}

	dispatchClient(event: string, from: string, data: any) {
		this.topics.dispatch(this.catchAllEvent, from, event, data);
		return this;
	}

	dispatch(event: string, data: any) {
		this.topics.dispatch(this.catchAllEvent, event, data);
		return this;
	}

	on(_event: string, fn: Fn) {
		this.topics.on(this.catchAllEvent, fn);
		return this;
	}

	off(_event: string, fn: Fn) {
		this.topics.off(this.catchAllEvent, fn);
		return this;
	}
}

/** A public channel: anyone with the app id can listen. */
export class Channel {
	protected readonly name: string;
	protected readonly pikoman: Pikoman;
	/** Joins tried since the server last took this channel away with `key_revoked`. */
	private revokedRetries = 0;
	private revokedTimer: any = 0;
	protected opcodes = new OpCodeHandler<MessageType>(this);
	protected messages: EventsHandler | AllEvents = new EventsHandler(this);

	constructor(name: string, pikoman: Pikoman) {
		this.name = name;
		this.pikoman = pikoman;
	}

	getName() {
		return this.name;
	}

	setEventsHandler(eventsHandler: EventsHandler | AllEvents) {
		eventsHandler.setContext(this);
		this.messages = eventsHandler;
	}

	join() {
		this.pikoman.send({ op: "join", channel: this.name });
	}

	leave() {
		clearTimeout(this.revokedTimer);
		// Through the client first, which forgets the channel and calls this again: one leave sent.
		if (this.pikoman.hasChannel(this)) {
			this.pikoman.leaveChannel(this.name);
			return;
		}
		this.pikoman.send({ op: "leave", channel: this.name });
	}

	/** Every event published to the channel over HTTP: `fn(data, event)`. */
	serverMessage(fn: Fn) {
		this.opcodes.on(MessageType.ServerMessage, fn);
	}

	/**
	 * The server refused something for this channel (`join_refused`, `not_allowed`, …), or, in an
	 * encrypted channel, a message did not decrypt (`decrypt_failed`): `fn(code)`.
	 */
	refused(fn: Fn) {
		this.opcodes.on(MessageType.Refused, fn);
	}

	clear() {
		this.opcodes.clear();
	}

	on(event: string, fn: Fn) {
		this.messages.on(event, fn);
		return this;
	}

	off(event: string, fn: Fn) {
		this.messages.off(event, fn);
		return this;
	}

	handle(message: ChannelMessage) {
		switch (message.op) {
			case "event": {
				if (message.event !== undefined) {
					this.messages.dispatch(message.event, message.data);
				}
				this.opcodes.dispatch(MessageType.ServerMessage, [message.data, message.event]);
				break;
			}
			case "joined": {
				this.revokedRetries = 0;
				this.opcodes.dispatch(MessageType.Subscribe, [MessageType.Subscribe]);
				break;
			}
			case "left": {
				this.opcodes.dispatch(MessageType.Unsubscribe, [MessageType.Unsubscribe]);
				break;
			}
			default: {
				this.opcodes.dispatch(MessageType.Unknown, [message]);
			}
		}
	}

	handleError(code: string) {
		if (code === "join_refused") {
			console.error(`Pikoman: not allowed to join ${this.name}`);
		}
		this.opcodes.dispatch(MessageType.Refused, [code]);
		if (code === "key_revoked") this.rejoinAfterRevoke();
	}

	/**
	 * The key that signed this channel's join token was deleted, and the server took the channel
	 * away. Join again, which asks the app's backend for a new token: after 1 s, then 2 s and 4 s if
	 * that is refused too, then give up (the backend may still sign with the deleted key).
	 */
	private rejoinAfterRevoke() {
		if (this.revokedRetries >= 3) return;
		clearTimeout(this.revokedTimer);
		const delay = 1000 * 2 ** this.revokedRetries;
		this.revokedRetries += 1;
		this.revokedTimer = setTimeout(() => {
			if (this.pikoman.hasChannel(this)) this.join();
		}, delay);
	}
}

/**
 * A `private-` channel: joining needs a token from the app's backend, and connections with
 * write access can send client events to each other.
 */
export class PrivateChannel extends Channel {
	private authenticator: Authenticator;

	constructor(
		name: string,
		pikoman: Pikoman,
		authenticator: Authenticator = new HttpAuthenticator(),
	) {
		super(name, pikoman);
		this.authenticator = authenticator;
	}

	join() {
		(async () => {
			try {
				const answer = await this.authenticator.authenticate(
					this.pikoman.getClientId(),
					this.name,
					this.pikoman.getOptions(),
				);
				const token = await this.accept(answer);
				if (token !== undefined) {
					this.pikoman.send({ op: "join", channel: this.name, token });
				}
			} catch (e) {
				console.error(`Pikoman: ${(e as Error).message}`);
			}
		})();
	}

	/** Takes the authenticator's answer; returns the token to join with, or nothing to not join. */
	protected async accept(answer: string | JoinAuthorization): Promise<string | undefined> {
		return typeof answer === "string" ? answer : answer.token;
	}

	protected report(code: ClientErrorCode) {
		this.opcodes.dispatch(MessageType.Refused, [code]);
	}

	/** Client events from other connections: `fn(clientId, event, data)`. */
	clientMessage(fn: Fn) {
		this.opcodes.on(MessageType.ClientMessage, fn);
	}

	handle(message: ChannelMessage) {
		if (message.op === "client_event") {
			this.messages.dispatchClient(message.event, message.from, message.data);
			this.opcodes.dispatch(MessageType.ClientMessage, [message.from, message.event, message.data]);
			return;
		}
		super.handle(message);
	}

	/**
	 * `toAll` also delivers the event to this connection. Throws for data with no JSON form (a
	 * function, a symbol); `undefined` is sent as `null`.
	 */
	send(event: string, data?: any, toAll = false) {
		eventJson(data);
		this.pikoman.send({
			op: "send",
			channel: this.name,
			event,
			data: data === undefined ? null : data,
			echo: toAll,
		});
	}
}

/**
 * A `presence-` channel: a private channel that also keeps track of who is in it, and which members
 * are bots. Member data is the app's own, exactly as its token said; only the server's list of bots
 * says who joined with an API key.
 */
export class PresenceChannel extends PrivateChannel {
	private membersMap: Map<string, any> = new Map();
	private botsMap: Map<string, string> = new Map();

	get me() {
		return this.getMember(this.pikoman.getClientId());
	}

	getMembers() {
		return this.membersMap;
	}

	addMember(userId: string, data: any) {
		this.membersMap.set(userId, data);
	}

	removeMember(userId: string) {
		this.membersMap.delete(userId);
	}

	getMember(userId: string) {
		return this.membersMap.get(userId);
	}

	setMembers(members: Map<string, any>) {
		this.membersMap = members;
	}

	/** The members that are bots: connection id to the id of the API key each joined with. */
	getBots() {
		return this.botsMap;
	}

	/** Whether a member joined as a bot, with an API key. Never from the member's data. */
	isBot(userId: string) {
		return this.botsMap.has(userId);
	}

	/** The id of the API key a bot joined with; `undefined` for everyone else. */
	botKey(userId: string) {
		return this.botsMap.get(userId);
	}

	/** Someone joined: `fn(MessageType.Subscribe, count, clientId, data)`. */
	subscribe(fn: Fn) {
		this.opcodes.on(MessageType.Subscribe, fn);
	}

	/** The member list changed: `fn(members)`. */
	members(fn: Fn) {
		this.opcodes.on(MessageType.ClientsInChannel, fn);
	}

	/** Someone joined or left: `fn(MessageType.Subscribe | MessageType.Unsubscribe, count, clientId, data?)`. */
	clients(fn: Fn) {
		this.opcodes.on(MessageType.Subscribe | MessageType.Unsubscribe, fn);
	}

	/** Someone left: `fn(MessageType.Unsubscribe, count, clientId)`. */
	unsubscribe(fn: Fn) {
		this.opcodes.on(MessageType.Unsubscribe, fn);
	}

	clientsCount(fn: Fn) {
		this.opcodes.on(
			MessageType.Subscribe | MessageType.Unsubscribe,
			(_event: MessageType, nrOfClients: number) => fn(nrOfClients),
		);
	}

	handle(message: ChannelMessage) {
		switch (message.op) {
			case "joined": {
				// Wait for member_joined, which says who joined.
				break;
			}
			case "member_joined": {
				this.addMember(message.id, message.data);
				if (message.bot !== undefined) {
					this.botsMap.set(message.id, message.bot);
				} else {
					this.botsMap.delete(message.id);
				}
				this.opcodes.dispatch(MessageType.Subscribe, [
					MessageType.Subscribe,
					message.count,
					message.id,
					message.data,
				]);
				this.opcodes.dispatch(MessageType.ClientsInChannel, [this.getMembers()]);
				break;
			}
			case "member_left": {
				this.removeMember(message.id);
				this.botsMap.delete(message.id);
				this.opcodes.dispatch(MessageType.Unsubscribe, [
					MessageType.Unsubscribe,
					message.count,
					message.id,
				]);
				this.opcodes.dispatch(MessageType.ClientsInChannel, [this.getMembers()]);
				break;
			}
			case "members": {
				this.setMembers(new Map(Object.entries(message.members)));
				this.botsMap = new Map(Object.entries(message.bots ?? {}));
				this.opcodes.dispatch(MessageType.ClientsInChannel, [this.getMembers()]);
				break;
			}
			default: {
				super.handle(message);
			}
		}
	}
}

/**
 * A `private-encrypted-` channel: a private channel whose events only the app's own backend and the
 * members with the channel key can read. Events are decrypted before `on`, `serverMessage` and
 * `clientMessage` see them, and `send` encrypts. A message that does not decrypt is dropped and
 * reported through `refused("decrypt_failed")`.
 *
 * The channel key comes from the authenticator: the token endpoint answers it as `channel_key`
 * (HttpAuthenticator), or a program with the master key derives it (MasterKeyAuthenticator).
 */
export class EncryptedChannel extends PrivateChannel {
	private key?: Promise<CryptoKey>;
	// Decrypting and encrypting are asynchronous; these keep messages in the order they came.
	private incoming: Promise<void> = Promise.resolve();
	private outgoing: Promise<void> = Promise.resolve();

	protected async accept(answer: string | JoinAuthorization): Promise<string | undefined> {
		const channelKey = typeof answer === "string" ? undefined : answer.channel_key;
		if (!channelKey) {
			console.error(`Pikoman: no channel_key for ${this.name}, so it is not joined`);
			this.report("no_channel_key");
			return undefined;
		}
		const key = importChannelKey(channelKey);
		await key;
		this.key = key;
		return typeof answer === "string" ? answer : answer.token;
	}

	handle(message: ChannelMessage) {
		this.incoming = this.incoming.then(async () => {
			if (message.op === "event" || message.op === "client_event") {
				let data: any;
				try {
					if (!this.key) {
						throw new Error("No channel key");
					}
					// What the backend published (op "event") and what members sent (op "client_event")
					// are authenticated with different directions, so one cannot pose as the other.
					const direction = message.op === "event" ? "server" : "client";
					data = await decryptEvent(this.name, message.event ?? "", message.data, await this.key, direction);
				} catch (e) {
					this.outside(() => this.report("decrypt_failed"));
					return;
				}
				this.outside(() => super.handle({ ...message, data }));
				return;
			}
			this.outside(() => super.handle(message));
		});
	}

	/**
	 * Runs the user's handlers. One that throws must not break the chain of incoming messages
	 * (every later message would be skipped, and in Node the unhandled rejection ends the process),
	 * so its error is thrown again on its own, as from any other event handler.
	 */
	private outside(run: () => void) {
		try {
			run();
		} catch (e) {
			setTimeout(() => {
				throw e;
			}, 0);
		}
	}

	/**
	 * Encrypts and sends a client event. `toAll` also delivers it to this connection. The promise
	 * settles once it is handed to the socket; it rejects if there is no channel key yet, if the
	 * connection is offline (nothing was sent), or if the data has no JSON form.
	 */
	send(event: string, data?: any, toAll = false): Promise<void> {
		const sent = this.outgoing.then(async () => {
			if (!this.key) {
				throw new Error(`No channel key for ${this.name} yet`);
			}
			const handed = this.pikoman.send({
				op: "send",
				channel: this.name,
				event,
				data: await encryptEvent(this.name, event, data, await this.key, "client"),
				echo: toAll,
			});
			if (!handed) {
				throw new Error(`Not connected: nothing was sent to ${this.name}`);
			}
		});
		this.outgoing = sent.catch(() => undefined);
		return sent;
	}
}
