import Pikoman from "./pikoman";
import { Fn, Listener, MessageType } from "./types";
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
    join(): void;
    subscribe(fn: Fn): void;
    clients(fn: Fn): void;
    unsubscribe(fn: Fn): void;
    clientsCount(fn: Fn): void;
    clientMessage(fn: Fn): void;
    send(data: string): void;
}
