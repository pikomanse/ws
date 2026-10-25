import {Fn, MessageCallback} from "./types";
import {callIsolated} from "./callbacks";

export class OpCodeHandler<T extends number> {
    private messages = Array<MessageCallback<T>>();
    private readonly context: any;

    constructor(context: any) {
        this.context = context;
    }

    private filterCallbacksArray(array: MessageCallback<T>[], type: T) {
        return array
            .filter(x => (type & x.type) === type)
            .map(({fn}) => fn);
    }

    /** Each callback isolated: one that throws stops neither the others nor the library (callbacks.ts). */
    // @ts-ignore
    private applyThis(context: SendData, data: Array<any>) {
        return (callback: Fn) => callIsolated(callback, context, data);
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