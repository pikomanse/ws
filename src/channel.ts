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
    join() {
        this.pikoman.send(`2:${this.name}`);
    }
    serverMessage(fn: Fn) {
        this.messages.on(MessageType.ServerMessage, fn);
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
    subscribe(fn: Fn) {
        this.messages.on(MessageType.Subscribe, fn);
    }
    clients(fn: Fn) {
        this.messages.on(MessageType.Subscribe | MessageType.Unsubscribe, fn);
    }
    unsubscribe(fn: Fn) {
        this.messages.on(MessageType.Unsubscribe, fn);
    }
    clientsCount(fn: Fn) {
        this.messages.on(MessageType.Subscribe | MessageType.Unsubscribe, (event, nrOfClients) => fn(nrOfClients));
    }
    clientMessage(fn: Fn) {
        this.messages.on(MessageType.ClientMessage, fn);
    }
    send(data: string) {
        this.pikoman.send(`8:${this.name}:${data}`);
    }
}