import { Fn, MessageType } from "./types";
import { MessageHandler } from "./message_handler";
import Pikoman from "./pikoman";
export declare class Channel {
    protected readonly name: string;
    protected readonly pikoman: Pikoman;
    messages: MessageHandler<MessageType>;
    constructor(name: string, pikoman: Pikoman);
    join(): void;
    serverMessage(fn: Fn): void;
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
