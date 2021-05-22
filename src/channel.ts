import {Fn, MessageType} from "./types";
import {MessageHandler} from "./message_handler";
import Pikoman from "./pikoman";

export class Channel {
    protected readonly name: string;
    protected readonly pikoman: Pikoman;
    public messages = new MessageHandler<MessageType>(this);
    constructor(name: string, pikoman: Pikoman) {
        this.name = name;
        this.pikoman = pikoman;
    }
    protected getAuthUrl() {
        return `${this.pikoman.getAuthUrl()}/${this.name}`;
    }
    join() {
        this.pikoman.send(`2:${this.name}`);
    }
    subscribe(fn: Fn) {
        this.messages.on(MessageType.Subscribe, fn);
    }
    clients(fn: Fn) {
        this.messages.on(MessageType.Subscribe | MessageType.Unsubscribe, fn);
    }
    unsubscribe(fn: Fn) {
        this.messages.on(MessageType.Unsubscribe, fn);
    }
    serverMessage(fn: Fn) {
        this.messages.on(MessageType.ServerMessage, fn);
    }
    clientMessage(fn: Fn) {
        this.messages.on(MessageType.ClientMessage, fn);
    }
    send(data: string) {
        this.pikoman.send(`8:${this.name}:${data}`);
    }
    clear() {
        this.messages.clear();
    }
}
export class PresenceChannel extends Channel {
    join() {
        (async () => {
            try {
                const clientId = this.pikoman.getClientId();
                const authenticator = this.pikoman.getAuthenticator();
                const response = await authenticator.authenticate(clientId, this.name, this.pikoman.getOptions());
                this.pikoman.send(response);
            } catch (e) {
                console.error(`Pikoman: ${e.message}`);
            }
        })();
    }
}