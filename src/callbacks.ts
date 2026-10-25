import {Fn} from "./types";

/**
 * The app's callbacks run isolated: one that throws never stops what the library does next (a
 * reconnect, a rejoin) or the callbacks after it. Its error is thrown again on its own, from a
 * timer, so it is reported as any uncaught error is (the console, `window.onerror`, an error
 * tracker), with its own stack.
 */
export function throwLater(error: unknown): void {
    setTimeout(() => {
        throw error;
    }, 0);
}

/** Calls one of the app's callbacks with `this` as `context`; what it throws goes to `throwLater`. */
export function callIsolated(fn: Fn, context: any, args: any[]): void {
    try {
        fn.apply(context, args);
    } catch (e) {
        throwLater(e);
    }
}
