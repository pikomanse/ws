import { Fn, Listener } from "../types";
export default class AllListener implements Listener {
    private topic;
    private topics;
    constructor(context: any);
    dispatch(data: string): void;
    on(_topic: string, fn: Fn): void;
    clear(): void;
}
