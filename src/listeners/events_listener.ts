import Topics from "../topics";
import {Fn, Listener} from "../types";

export default class EventsListener implements Listener {
    private topics;

    constructor(context?: any) {
        this.topics = new Topics(context);
    }

    dispatch(event: string, data: any): void {
        this.topics.dispatch(event, data);
    }

    on(topic: string, fn: Fn): void {
        this.topics.on(topic, fn);
    }

    clear(): void {
        this.topics.clear();
    }
}

/** Like EventsListener, but always hands the data over as a string. */
export class StringEventsListener implements Listener {
    private topics;

    constructor(context?: any) {
        this.topics = new Topics(context);
    }

    dispatch(event: string, data: any): void {
        this.topics.dispatch(event, typeof data === 'string' ? data : JSON.stringify(data));
    }

    on(topic: string, fn: Fn): void {
        this.topics.on(topic, fn);
    }

    clear(): void {
        this.topics.clear();
    }
}
