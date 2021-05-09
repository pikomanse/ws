import {Fn, MessageCallback} from "./types";

export class MessageHandler<T extends number> {
    private messages = Array<MessageCallback<T>>();
    private readonly context: any;
    constructor(context: any) {
        this.context = context;
    }
    private filterCallbacksArray(array: MessageCallback<T>[], type: T) {
        return array
            .filter(x => (type & x.type) === type)
            .map(({ fn }) => fn);
    }
    // @ts-ignore
    private applyThis(context: SendData, data: Array<any>) {
        return (callback: Fn) => callback.apply(context, data);
    }
    public on(type: T, fn: Fn) {
        this.messages.push({
            fn,
            type
        });
    }
    clear() {
        this.messages = [];
    }
    dispatch(type: T, data: any[] = []) {
        this.filterCallbacksArray(this.messages, type)
            .forEach(this.applyThis(this.context, data));
    }
}