import Pikoman from "./pikoman";
import { Authenticator, ChannelMessage, Fn, MessageType } from "./types";
import { OpCodeHandler } from "./opcode_handler";
/** Calls `on(event, fn)` listeners with the event's data (and the sender, for client events). */
export declare class EventsHandler {
    private topics;
    constructor(context?: any);
    setContext(context?: any): void;
    dispatchClient(event: string, from: string, data: any): this;
    dispatch(event: string, data: any): this;
    on(event: string, fn: Fn): this;
    off(event: string, fn: Fn): this;
}
/** Calls every listener for every event, whatever name it was registered with. */
export declare class AllEvents {
    private topics;
    private catchAllEvent;
    constructor(context?: any);
    setContext(context?: any): void;
    dispatchClient(event: string, from: string, data: any): this;
    dispatch(event: string, data: any): this;
    on(_event: string, fn: Fn): this;
    off(_event: string, fn: Fn): this;
}
/** A public channel: anyone with the app id can listen. */
export declare class Channel {
    protected readonly name: string;
    protected readonly pikoman: Pikoman;
    protected opcodes: OpCodeHandler<MessageType>;
    protected messages: EventsHandler | AllEvents;
    constructor(name: string, pikoman: Pikoman);
    getName(): string;
    setEventsHandler(eventsHandler: EventsHandler | AllEvents): void;
    join(): void;
    leave(): void;
    /** Every event published to the channel over HTTP: `fn(data, event)`. */
    serverMessage(fn: Fn): void;
    /** The server refused to let this connection join: `fn(code)`. */
    refused(fn: Fn): void;
    clear(): void;
    on(event: string, fn: Fn): this;
    off(event: string, fn: Fn): this;
    handle(message: ChannelMessage): void;
    handleError(code: string): void;
}
/**
 * A `private-` channel: joining needs a token from the app's backend, and connections with
 * write access can send client events to each other.
 */
export declare class PrivateChannel extends Channel {
    private authenticator;
    constructor(name: string, pikoman: Pikoman, authenticator?: Authenticator);
    join(): void;
    /** Client events from other connections: `fn(clientId, event, data)`. */
    clientMessage(fn: Fn): void;
    handle(message: ChannelMessage): void;
    /** `toAll` also delivers the event to this connection. */
    send(event: string, data?: any, toAll?: boolean): void;
}
/** A `presence-` channel: a private channel that also keeps track of who is in it. */
export declare class PresenceChannel extends PrivateChannel {
    private membersMap;
    get me(): any;
    getMembers(): Map<string, any>;
    addMember(userId: string, data: any): void;
    removeMember(userId: string): void;
    getMember(userId: string): any;
    setMembers(members: Map<string, any>): void;
    /** Someone joined: `fn(MessageType.Subscribe, count, clientId, data)`. */
    subscribe(fn: Fn): void;
    /** The member list changed: `fn(members)`. */
    members(fn: Fn): void;
    /** Someone joined or left: `fn(MessageType.Subscribe | MessageType.Unsubscribe, count, clientId, data?)`. */
    clients(fn: Fn): void;
    /** Someone left: `fn(MessageType.Unsubscribe, count, clientId)`. */
    unsubscribe(fn: Fn): void;
    clientsCount(fn: Fn): void;
    handle(message: ChannelMessage): void;
}
