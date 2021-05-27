import Pikoman from "./pikoman";
import {Authenticator, Fn, Listener, MessageType} from "./types";
import {OpCodeHandler} from "./opcode_handler";
import {AllListener} from "./listeners";
import {HttpAuthenticator} from "./authenticators";

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
    private authenticator: Authenticator;
    private membersMap: Map<string, any> = new Map();
    constructor(name: string, pikoman: Pikoman, authenticator: Authenticator = new HttpAuthenticator()) {
        super(name, pikoman);
        this.authenticator = authenticator;
    }
    join() {
        (async () => {
            try {
                const clientId = this.pikoman.getClientId();
                const response = await this.authenticator.authenticate(clientId, this.name, this.pikoman.getOptions());
                this.pikoman.send(response);
            } catch (e) {
                console.error(`Pikoman: ${e.message}`);
            }
        })();
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
    getMember(userId: number) {
        return this.membersMap.get(userId.toString());
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
        this.opcodes.on(MessageType.Subscribe | MessageType.Unsubscribe, (event, nrOfClients) => fn(nrOfClients));
    }
    clientMessage(fn: Fn) {
        this.opcodes.on(MessageType.ClientMessage, fn);
    }
    send(data: string) {
        this.pikoman.send(`8:${this.name}:${data}`);
    }
}