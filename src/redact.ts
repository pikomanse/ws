/**
 * Objects that hold a secret keep it out of sight: the secret lives in a WeakMap keyed by the
 * object (what TypeScript makes of `#private` fields; the ES5 build cannot have them), so it is
 * not a property that `JSON.stringify`, `util.inspect`, `console.log` or a debugger's object view
 * can reach, and `toJSON` and the inspect hook say plainly that it is hidden.
 */

/** Node's `util.inspect.custom`, without importing `util` (the browser bundle has no `util`). */
export const INSPECT: symbol = Symbol.for('nodejs.util.inspect.custom');

/** Whether this runs in a browser page (a worker or a server has no `window` and `document`). */
export function inBrowser(): boolean {
    const g = globalThis as any;
    return typeof g.window !== 'undefined' && typeof g.document !== 'undefined';
}

/**
 * Throws in a browser: what needs an API key or the master key belongs on a server, where the
 * page's visitors cannot read it.
 */
export function refuseInBrowser(what: string): void {
    if (inBrowser()) {
        throw new Error(`Pikoman: ${what} holds a secret key and runs only on a server, never in a browser: anyone can read what a page holds. Keep the key in your backend and give the browser tokens (HttpAuthenticator).`);
    }
}
