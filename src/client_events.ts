/**
 * Members' client events are named `client-…`, so they never share a name, or a handler, with
 * the events a backend publishes, which never start with it. Pusher has the same rule.
 */
export const CLIENT_EVENT_PREFIX = 'client-';

/** The name a client event goes by: `name` with `client-` in front, unless it already has it. */
export function clientEventName(name: string): string {
    return name.startsWith(CLIENT_EVENT_PREFIX) ? name : CLIENT_EVENT_PREFIX + name;
}
