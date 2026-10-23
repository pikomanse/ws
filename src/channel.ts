import Pikoman from "./pikoman";
import { Authenticator, ChannelMessage, Fn, MessageType } from "./types";
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
		this.pikoman.send({ op: "leave", channel: this.name });
		this.pikoman.leaveChannel(this.name);
	}

	/** Every event published to the channel over HTTP: `fn(data, event)`. */
	serverMessage(fn: Fn) {
		this.opcodes.on(MessageType.ServerMessage, fn);
	}

	/** The server refused to let this connection join: `fn(code)`. */
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
				const token = await this.authenticator.authenticate(
					this.pikoman.getClientId(),
					this.name,
					this.pikoman.getOptions(),
				);
				this.pikoman.send({ op: "join", channel: this.name, token });
			} catch (e) {
				console.error(`Pikoman: ${(e as Error).message}`);
			}
		})();
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

	/** `toAll` also delivers the event to this connection. */
	send(event: string, data?: any, toAll = false) {
		this.pikoman.send({
			op: "send",
			channel: this.name,
			event,
			data: data === undefined ? null : data,
			echo: toAll,
		});
	}
}

/** A `presence-` channel: a private channel that also keeps track of who is in it. */
export class PresenceChannel extends PrivateChannel {
	private membersMap: Map<string, any> = new Map();

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
				this.opcodes.dispatch(MessageType.ClientsInChannel, [this.getMembers()]);
				break;
			}
			default: {
				super.handle(message);
			}
		}
	}
}
