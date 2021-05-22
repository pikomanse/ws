import { Fn, Listener } from "../types";
export default class EventsListener implements Listener {
    private topics;
    constructor(context: any);
    dispatch(data: string): void;
    on(topic: string, fn: Fn): void;
    clear(): void;
}
