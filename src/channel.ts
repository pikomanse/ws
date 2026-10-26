import Pikoman from "./pikoman";
import { Authenticator, ChannelMessage, ClientErrorCode, Fn, JoinAuthorization, KickInfo, KickOptions, Member, MessageInfo, MessageType } from "./types";
import { decryptEvent, encryptEvent, eventJson, importChannelKey } from "./encryption";
import { OpCodeHandler } from "./opcode_handler";
import { HttpAuthenticator } from "./authenticators";
import { clientEventName } from "./client_events";
import { throwLater } from "./callbacks";
import Topics from "./topics";
import { kickFields } from "./kick";

/** The name a client event is sent under: `client-` in front, unless it has it. Throws for no name. */
function outgoingName(event: string): string {
	if (typeof event !== "string" || event === "") {
		throw new Error("Pikoman: a client event needs a name");
	}
	return clientEventName(event);
}

/** The `to` or `to_user` of a send to one member. Throws for anything else. */
function target(member: Member, what = "sendTo"): { to: string } | { to_user: string } {
	if (typeof member === "string" && member !== "") return { to: member };
	if (member && typeof member === "object" && typeof member.userId === "string" && member.userId !== "") {
		return { to_user: member.userId };
	}
	throw new Error(`Pikoman: ${what} needs a connection id or { userId }`);
}

/**
 * What the server says about a message beside its data (`MessageInfo`), or nothing when it says
 * nothing more, so handlers get the same arguments as before for an ordinary message.
 */
function infoOf(message: { direct?: boolean, user_id?: string, bot?: string }): MessageInfo | undefined {
	if (message.direct !== true && message.user_id === undefined && message.bot === undefined) {
		return undefined;
	}
	const info: MessageInfo = { direct: message.direct === true };
	if (message.user_id !== undefined) info.userId = message.user_id;
	if (message.bot !== undefined) info.bot = message.bot;
	return info;
}

/** The arguments with `info` last, when there is one. */
function withInfo(args: any[], info: MessageInfo | undefined): any[] {
	return info === undefined ? args : [...args, info];
}

/** Calls `on(event, fn)` listeners with the event's data (and the sender, for client events). */
export class EventsHandler {
	private topics: Topics;

	constructor(context?: any) {
		this.topics = new Topics(context);
	}

	setContext(context?: any) {
		this.topics.setContext(context);
	}

	dispatchClient(event: string, from: string, data: any, info?: MessageInfo) {
		this.topics.dispatch(event, ...withInfo([from, data], info));
		return this;
	}

	dispatch(event: string, data: any, info?: MessageInfo) {
		this.topics.dispatch(event, ...withInfo([data], info));
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
	/** A moderator removed this connection from the channel; `left` follows. */
	private kickedOut = false;
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

	/**
	 * A moderator (a bot with the `kick` right, or the app's backend) removed this connection from
	 * the channel: `fn({ reason, banSeconds })`. The connection and its other channels stay. The
	 * client forgets the channel (it is not joined again on reconnect); listen to it again to
	 * rejoin, which is refused with `refused("banned")` until a ban has run out.
	 */
	kicked(fn: Fn) {
		this.opcodes.on(MessageType.Kicked, fn);
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

	/** Forgets the `refused`, `serverMessage` (and other such) callbacks, and stops any pending join. */
	clear() {
		clearTimeout(this.revokedTimer);
		this.opcodes.clear();
	}

	/**
	 * Events by name: `fn(data)` for what a backend published, and `fn(data, info)` with
	 * `info.direct` true when it was pushed to this member alone. Members' client events are named `client-…` (see
	 * `PrivateChannel.onClient`), so they never reach a handler for a published event.
	 */
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
				const info = infoOf(message);
				if (message.event !== undefined) {
					this.messages.dispatch(message.event, message.data, info);
				}
				this.opcodes.dispatch(MessageType.ServerMessage, withInfo([message.data, message.event], info));
				break;
			}
			case "joined": {
				this.revokedRetries = 0;
				this.opcodes.dispatch(MessageType.Subscribe, [MessageType.Subscribe]);
				break;
			}
			case "left": {
				this.opcodes.dispatch(MessageType.Unsubscribe, [MessageType.Unsubscribe]);
				// Kicked out: not joined again on reconnect.
				if (this.kickedOut) this.pikoman.forgetChannel(this);
				break;
			}
			case "kicked": {
				// `left` follows.
				this.kickedOut = true;
				const info: KickInfo = {};
				if (message.reason !== undefined) info.reason = message.reason;
				if (message.ban_seconds !== undefined) info.banSeconds = message.ban_seconds;
				this.opcodes.dispatch(MessageType.Kicked, [info]);
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
	 * that is refused too, then report `rejoin_failed` (the backend may still sign with the deleted
	 * key). With `rejoin_on_revoke: false` the app handles `key_revoked` itself.
	 */
	private rejoinAfterRevoke() {
		if (!this.pikoman.rejoinsOnRevoke()) return;
		if (this.revokedRetries >= 3) {
			this.opcodes.dispatch(MessageType.Refused, ["rejoin_failed"]);
			return;
		}
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
		const clientId = this.pikoman.getClientId();
		// Not connected: the channel joins when the server says `connected`.
		if (clientId === "") return;
		(async () => {
			try {
				const answer = await this.authenticator.authenticate(
					clientId,
					this.name,
					{ ...this.pikoman.getOptions(), app: this.pikoman.getAppId() },
				);
				const token = await this.accept(answer);
				// Not if the app left the channel meanwhile, or the connection changed: the token is
				// for the old one, and the new one joins with a token of its own.
				if (token !== undefined && this.pikoman.hasChannel(this) && this.pikoman.getClientId() === clientId) {
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

	/**
	 * Every client event from other connections: `fn(clientId, event, data, info)`, `event` named
	 * `client-…`; `info` as in `onClient`.
	 */
	clientMessage(fn: Fn) {
		this.opcodes.on(MessageType.ClientMessage, fn);
	}

	/**
	 * One client event from other connections, by name with or without `client-` (`"typing"` and
	 * `"client-typing"` are the same): `fn(clientId, data, info)`. The same as
	 * `on("client-typing", fn)`. `info` comes only when the server says more: `info.direct` is true when it was sent to this member alone
	 * (`sendTo`), `info.userId` is the sender's user id from its signed member data and `info.bot`
	 * the API key a bot joined with; the server sets them, never the sender.
	 */
	onClient(event: string, fn: Fn) {
		return this.on(clientEventName(event), fn);
	}

	offClient(event: string, fn: Fn) {
		return this.off(clientEventName(event), fn);
	}

	handle(message: ChannelMessage) {
		if (message.op === "client_event") {
			// Under its client- name, also when the sender left it out (an older client), so a
			// member can never reach a handler for a published event.
			const event = clientEventName(message.event ?? "");
			const info = infoOf(message);
			this.messages.dispatchClient(event, message.from, message.data, info);
			this.opcodes.dispatch(MessageType.ClientMessage, withInfo([message.from, event, message.data], info));
			return;
		}
		super.handle(message);
	}

	/**
	 * Sends a client event to the channel's other members, named `client-…`: `send("typing")`
	 * sends `client-typing`, which they get with `onClient("typing")`. `toAll` also delivers it to
	 * this connection. Throws for data with no JSON form (a function, a symbol); `undefined` is sent
	 * as `null`.
	 */
	send(event: string, data?: any, toAll = false) {
		const name = outgoingName(event);
		eventJson(data);
		this.pikoman.send({
			op: "send",
			channel: this.name,
			event: name,
			data: data === undefined ? null : data,
			echo: toAll,
		});
	}

	/**
	 * Sends a client event to one member of the channel only: `sendTo("c_…", "answer", data)` to a
	 * connection (its id, as in the member list or a client event's sender), or
	 * `sendTo({ userId: "42" }, …)` to every connection of that user (the `user_id` in their signed
	 * member data; presence channels). Nobody else gets it, and it gets `info.direct`. A member
	 * that is not in the channel is refused with `refused("no_such_member")`. Needs write access,
	 * as `send`, and counts against the same 10 a second.
	 */
	sendTo(member: Member, event: string, data?: any) {
		const to = target(member);
		const name = outgoingName(event);
		eventJson(data);
		this.pikoman.send({
			op: "send",
			channel: this.name,
			event: name,
			data: data === undefined ? null : data,
			echo: false,
			...to,
		});
	}

	/**
	 * Removes a member from this channel, for a bot that joined it with an API key that has the
	 * `kick` right for the channel (`ban` with `banSeconds`): `kick("c_…")` one connection, or
	 * `kick({ userId: "42" })` every connection of that user (presence channels). The member gets
	 * `kicked({ reason, banSeconds })` and leaves this channel only; with `banSeconds` (at most
	 * 86 400) it may not join again until then. A user's connection, a key without the right, the
	 * bot itself or another bot: `refused("not_allowed")`; nobody there:
	 * `refused("no_such_member")`. Counts against the 10 client events a second.
	 */
	kick(member: Member, options: KickOptions = {}) {
		const to = target(member, "kick");
		const fields = kickFields(options);
		this.pikoman.send({ op: "kick", channel: this.name, ...to, ...fields });
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
			case "kicked": {
				// Out of the channel: nobody is listed any more.
				this.membersMap = new Map();
				this.botsMap = new Map();
				super.handle(message);
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
	 * Runs the user's handlers (each isolated already, see callbacks.ts). Nothing thrown may break
	 * the chain of incoming messages (every later message would be skipped, and in Node the
	 * unhandled rejection ends the process), so an error is thrown again on its own.
	 */
	private outside(run: () => void) {
		try {
			run();
		} catch (e) {
			throwLater(e);
		}
	}

	/**
	 * Encrypts and sends a client event, named `client-…` as in `PrivateChannel.send`. `toAll` also
	 * delivers it to this connection. The promise settles once it is handed to the socket; it
	 * rejects if there is no channel key yet, if the connection is offline (nothing was sent), or if
	 * the data has no JSON form.
	 */
	send(event: string, data?: any, toAll = false): Promise<void> {
		return this.sendEncrypted(event, data, toAll);
	}

	/** Encrypts and sends a client event to one member, as `PrivateChannel.sendTo`. */
	sendTo(member: Member, event: string, data?: any): Promise<void> {
		let to: { to: string } | { to_user: string };
		try {
			to = target(member);
		} catch (e) {
			return Promise.reject(e);
		}
		return this.sendEncrypted(event, data, false, to);
	}

	private sendEncrypted(event: string, data: any, toAll: boolean, to?: { to: string } | { to_user: string }): Promise<void> {
		const sent = this.outgoing.then(async () => {
			// The name as sent is the name the receivers decrypt with.
			const name = outgoingName(event);
			if (!this.key) {
				throw new Error(`No channel key for ${this.name} yet`);
			}
			const handed = this.pikoman.send({
				op: "send",
				channel: this.name,
				event: name,
				data: await encryptEvent(this.name, name, data, await this.key, "client"),
				echo: toAll,
				...(to ?? {}),
			});
			if (!handed) {
				throw new Error(`Not connected: nothing was sent to ${this.name}`);
			}
		});
		this.outgoing = sent.catch(() => undefined);
		return sent;
	}
}
