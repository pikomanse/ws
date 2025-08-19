import Pikoman from "./pikoman";
import { Authenticator, Fn, MessageType } from "./types";
import { OpCodeHandler } from "./opcode_handler";
import { HttpAuthenticator } from "./authenticators";
import Topics from "./topics";
import { splitn } from "./helpers";

export class EventsHandler {
	private topics: Topics;

	constructor(context?: any) {
		this.topics = new Topics(context);
	}

	setContext(context?: any) {
		this.topics.setContext(context);
	}

	dispatchClient(args: string) {
		const [id = 0, event = "all", rest] = splitn(args, ":", 3);
		try {
			this.topics.dispatch(event, id, JSON.parse(rest));
		} catch (e) {
			this.topics.dispatch(event, id, rest);
		}
		return this;
	}

	dispatch(args: string) {
		const [event = "all", rest] = splitn(args, ":", 2);
		try {
			this.topics.dispatch(event, JSON.parse(rest));
		} catch (e) {
			this.topics.dispatch(event, rest);
		}
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

export class AllEvents {
	private context;
	private topics: Topics;
	private catchAllEvent = "all";

	constructor(context?: any) {
		this.context = context;
		this.topics = new Topics(context);
	}

	setContext(context?: any) {
		this.topics.setContext(context);
		this.context = context;
	}

	dispatchClient(args: string) {
		const [id = 0, rest] = splitn(args, ":", 2);
		this.topics.dispatch(this.catchAllEvent, id, rest);
		return this;
	}

	dispatch(args: string) {
		this.topics.dispatch(this.catchAllEvent, args);
		return this;
	}

	on(_event: string, fn: Fn) {
		this.topics.on(this.catchAllEvent, fn);
		return this;
	}

	off(event: string, fn: Fn) {
		this.topics.off(this.catchAllEvent, fn);
		return this;
	}
}

export class Channel {
	protected readonly name: string;
	protected readonly pikoman: Pikoman;
	protected opcodes = new OpCodeHandler<MessageType>(this);
	protected messages = new EventsHandler(this);

	constructor(name: string, pikoman: Pikoman) {
		this.name = name;
		this.pikoman = pikoman;
	}

	setEventsHandler(eventsHandler: any) {
		eventsHandler.setContext(this);
		this.messages = eventsHandler;
	}

	join() {
		this.pikoman.send(`2:${this.name}`);
	}

	leave() {
		this.pikoman.send(`4:${this.name}`);
		this.pikoman.leaveChannel(this.name);
	}

	serverMessage(fn: Fn) {
		this.opcodes.on(MessageType.ServerMessage, fn);
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

	dispatch(opcode: number, data: string) {
		switch (opcode) {
			case MessageType.ServerMessage: {
				this.messages.dispatch(data);
				this.opcodes.dispatch(MessageType.ServerMessage, [data]);
				break;
			}
			case MessageType.Subscribe: {
				this.opcodes.dispatch(MessageType.Subscribe, [MessageType.Subscribe]);
				break;
			}
			case MessageType.Unsubscribe: {
				this.opcodes.dispatch(MessageType.Unsubscribe, [
					MessageType.Unsubscribe,
				]);
				break;
			}
			default: {
				this.opcodes.dispatch(MessageType.Unknown, [data]);
			}
		}
	}
}

export class PresenceChannel extends Channel {
	private authenticator: Authenticator;
	private membersMap: Map<string, any> = new Map();

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
				const clientId = this.pikoman.getClientId();
				const response = await this.authenticator.authenticate(
					clientId,
					this.name,
					this.pikoman.getOptions(),
				);
				this.pikoman.send(response);
			} catch (e) {
				console.error(`Pikoman: ${e.message}`);
			}
		})();
	}

	get me() {
		return this.membersMap.get(this.pikoman.getClientId());
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

	subscribe(fn: Fn) {
		this.opcodes.on(MessageType.Subscribe, fn);
	}

	members(fn: Fn) {
		this.opcodes.on(MessageType.ClientsInChannel, fn);
	}

	clients(fn: Fn) {
		this.opcodes.on(MessageType.Subscribe | MessageType.Unsubscribe, fn);
	}

	unsubscribe(fn: Fn) {
		this.opcodes.on(MessageType.Unsubscribe, fn);
	}

	clientsCount(fn: Fn) {
		this.opcodes.on(
			MessageType.Subscribe | MessageType.Unsubscribe,
			(event, nrOfClients) => fn(nrOfClients),
		);
	}

	clientMessage(fn: Fn) {
		this.opcodes.on(MessageType.ClientMessage, (data) => {
			const [clientId, msg] = splitn(data, ":", 2);
			fn(clientId, msg);
		});
	}

	dispatch(opcode: number, data: string) {
		switch (opcode) {
			case MessageType.Subscribe: {
				const [nrOfUsers, userId = "", userData = "{}"] = splitn(data, ":", 3);
				this.addMember(userId, userData);
				this.opcodes.dispatch(MessageType.Subscribe, [
					MessageType.Subscribe,
					parseInt(nrOfUsers, 10),
					userId,
					JSON.parse(userData),
				]);
				this.opcodes.dispatch(MessageType.ClientsInChannel, [
					this.getMembers(),
				]);
				break;
			}
			case MessageType.Unsubscribe: {
				const [nrOfUsers, userId] = splitn(`${data}`, ":", 2);
				this.removeMember(userId);
				this.opcodes.dispatch(MessageType.Unsubscribe, [
					MessageType.Unsubscribe,
					parseInt(nrOfUsers, 10),
					userId,
				]);
				this.opcodes.dispatch(MessageType.ClientsInChannel, [
					this.getMembers(),
				]);
				break;
			}
			case MessageType.ClientMessage: {
				this.messages.dispatchClient(data);
				this.opcodes.dispatch(MessageType.ClientMessage, [data]);
				break;
			}
			case MessageType.ClientsInChannel: {
				const members = new Map(Object.entries(JSON.parse(data)));
				this.setMembers(members);
				this.opcodes.dispatch(MessageType.ClientsInChannel, [members]);
				this.opcodes.dispatch(MessageType.Subscribe, [
					MessageType.Subscribe,
					Array.from(this.getMembers().keys()).length,
					this.pikoman.getClientId(),
					JSON.parse(this.getMember(this.pikoman.getClientId())),
				]);
				break;
			}
			default: {
				super.dispatch(opcode, data);
			}
		}
	}

	send(event: string, data: any, toAll = false) {
		if (data) {
			this.pikoman.send(
				`${MessageType.ClientMessage}:${this.name}:${Number(toAll)}:${event}:${JSON.stringify(data)}`,
			);
		} else {
			this.pikoman.send(
				`${MessageType.ClientMessage}:${this.name}:${Number(toAll)}:${event}`,
			);
		}
	}
}

