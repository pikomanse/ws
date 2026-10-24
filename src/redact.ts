/**
 * Objects that hold a secret keep it out of sight: the secret lives in a WeakMap keyed by the
 * object (what TypeScript makes of `#private` fields; the ES5 build cannot have them), so it is
 * not a property that `JSON.stringify`, `util.inspect`, `console.log` or a debugger's object view
 * can reach, and `toJSON` and the inspect hook say plainly that it is hidden.
 */

/** Node's `util.inspect.custom`, without importing `util` (the browser bundle has no `util`). */
export const INSPECT: symbol = Symbol.for('nodejs.util.inspect.custom');
