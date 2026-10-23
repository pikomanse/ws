import Topics from "../topics";
import {Fn, Listener} from "../types";

export default class AllListener implements Listener {
    private topic = 'all';
    private topics;

    constructor(context?: any) {
        this.topics = new Topics(context);
    }

    dispatch(event: string, data: any): void {
        this.topics.dispatch(this.topic, event, data);
    }

    on(_topic: string, fn: Fn): void {
        this.topics.on(this.topic, fn);
    }

    clear(): void {
        this.topics.clear();
    }
}
