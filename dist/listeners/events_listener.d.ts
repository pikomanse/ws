import { Fn, Listener } from "../types";
export default class EventsListener implements Listener {
    private topics;
    constructor(context?: any);
    dispatch(event: string, data: any): void;
    on(topic: string, fn: Fn): void;
    clear(): void;
}
/** Like EventsListener, but always hands the data over as a string. */
export declare class StringEventsListener implements Listener {
    private topics;
    constructor(context?: any);
    dispatch(event: string, data: any): void;
    on(topic: string, fn: Fn): void;
    clear(): void;
}
