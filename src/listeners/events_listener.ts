import Topics from "../topics";
import {Fn, Listener} from "../types";

export default class EventsListener implements Listener {
    private topics;
    constructor(context: any) {
        this.topics = new Topics(context);
    }
    dispatch(data: string): void {
        if (data.length === 0) {
            return;
        }
        const [eventName, ...rest] = data.split(':');
        this.topics.dispatch(eventName, rest);
    }
    on(topic: string, fn: Fn): void {
        this.topics.on(topic, fn);
    }
    clear(): void {
        this.topics.clear();
    }
}