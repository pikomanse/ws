import Pikoman from "./pikoman";
import { Authenticator, Fn, Listener, MessageType } from "./types";
import { OpCodeHandler } from "./opcode_handler";
export declare class Channel {
    protected readonly name: string;
    protected readonly pikoman: Pikoman;
    opcodes: OpCodeHandler<MessageType>;
    listener: Listener;
    constructor(name: string, pikoman: Pikoman);
    setListener(listener: Listener): void;
    join(): void;
    serverMessage(fn: Fn): void;
    dispatch(data: string): void;
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
