import Pikoman from "./pikoman";
import {Fn, Listener, MessageType} from "./types";
import {OpCodeHandler} from "./opcode_handler";
import { AllListener } from "./listeners";

export class Channel {
    protected readonly name: string;
    protected readonly pikoman: Pikoman;
    public opcodes = new OpCodeHandler<MessageType>(this);
    public listener: Listener = new AllListener(this);
    constructor(name: string, pikoman: Pikoman) {
        this.name = name;
        this.pikoman = pikoman;
    }
    setListener(listener: Listener) {
        this.listener = listener;
    }
    join() {
        this.pikoman.send(`2:${this.name}`);
    }
    serverMessage(fn: Fn) {
        this.listener.on('all', fn);
    }
    dispatch(data: string) {
        this.listener.dispatch(data);
    }
    clear() {
        this.opcodes.clear();
        this.listener.clear();
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
        this.opcodes.on(MessageType.Subscribe, fn);
    }
    clients(fn: Fn) {
        this.opcodes.on(MessageType.Subscribe | MessageType.Unsubscribe, fn);
    }
    unsubscribe(fn: Fn) {
        this.opcodes.on(MessageType.Unsubscribe, fn);
    }
    clientsCount(fn: Fn) {
        this.opcodes.on(MessageType.Subscribe | MessageType.Unsubscribe, (event, nrOfClients) => fn(nrOfClients));
    }
    clientMessage(fn: Fn) {
        this.opcodes.on(MessageType.ClientMessage, fn);
    }
    send(data: string) {
        this.pikoman.send(`8:${this.name}:${data}`);
    }
}