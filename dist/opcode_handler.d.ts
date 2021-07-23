import { Fn } from "./types";
export declare class OpCodeHandler<T extends number> {
    private messages;
    private readonly context;
    constructor(context: any);
    private filterCallbacksArray;
    private applyThis;
    on(type: T, fn: Fn): void;
    clear(): void;
    dispatch(type: T, data?: any[]): void;
}
