import Pikoman from "./pikoman";
import { Authenticator, Fn, MessageType } from "./types";
import { OpCodeHandler } from "./opcode_handler";
export declare class EventsHandler {
    private context;
    private topics;
    constructor(context?: any);
    setContext(context?: any): void;
    dispatchClient(args: string): this;
    dispatch(args: string): this;
    on(event: string, fn: Fn): this;
    off(event: string, fn: Fn): this;
}
export declare class AllEvents {
    private context;
    private topics;
    private catchAllEvent;
    constructor(context?: any);
    setContext(context?: any): void;
    dispatchClient(args: string): this;
    dispatch(args: string): this;
    on(_event: string, fn: Fn): this;
    off(event: string, fn: Fn): this;
}
export declare class Channel {
    protected readonly name: string;
    protected readonly pikoman: Pikoman;
    opcodes: OpCodeHandler<MessageType>;
    messages: EventsHandler;
    constructor(name: string, pikoman: Pikoman);
    setEventsHandler(eventsHandler: any): void;
    join(): void;
    serverMessage(fn: Fn): void;
    clear(): void;
}
export declare class PresenceChannel extends Channel {
    private authenticator;
    private membersMap;
    constructor(name: string, pikoman: Pikoman, authenticator?: Authenticator);
    join(): void;
    getMembers(): Map<string, any>;
    addMember(userId: string, data: any): void;
    removeMember(userId: string): void;
    getMember(userId: string): any;
    setMembers(members: Map<string, any>): void;
    subscribe(fn: Fn): void;
    members(fn: Fn): void;
    clients(fn: Fn): void;
    unsubscribe(fn: Fn): void;
    clientsCount(fn: Fn): void;
    clientMessage(fn: Fn): void;
    send(data: string): void;
}
