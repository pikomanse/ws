/**
 * What goes into an address: names checked against what the server takes, so a name can never
 * become another path (`private-x/../../api/account/delete?`), and addresses that keep tokens and
 * messages off the network in the clear (the same rule as the Rust crate).
 */

/** The server's rule for channel names. */
const CHANNEL_NAME = /^[A-Za-z0-9_\-=@,.;]{1,164}$/;
/** The server's rule for app ids. */
const APP_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Connection ids: the server makes `c_` and hex; letters and digits are all a path may hold here. */
const CONNECTION_ID = /^c_[A-Za-z0-9]{1,64}$/;
/** Hosts on this machine, as `URL` and `location` write them. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function checkChannelName(name: string): string {
    if (typeof name !== 'string' || !CHANNEL_NAME.test(name)) {
        throw new Error(`Pikoman: ${JSON.stringify(name)} is not a channel name: 1-164 characters of A-Z a-z 0-9 _ - = @ , . ;`);
    }
    return name;
}

export function checkAppId(id: string): string {
    if (typeof id !== 'string' || !APP_ID.test(id)) {
        throw new Error(`Pikoman: ${JSON.stringify(id)} is not an app id: 1-64 characters of A-Z a-z 0-9 - _`);
    }
    return id;
}

export function checkConnectionId(id: string): string {
    if (typeof id !== 'string' || !CONNECTION_ID.test(id)) {
        throw new Error(`Pikoman: ${JSON.stringify(id)} is not a connection id from the server`);
    }
    return id;
}

/**
 * `address` without a trailing slash: `secure` (https, wss), or `plain` (http, ws) only to a server
 * on this machine. Anything else is refused, so a key's tokens never cross a network in the clear.
 */
export function checkedAddress(address: string, secure: 'https' | 'wss', plain: 'http' | 'ws'): string {
    const trimmed = String(address).trim().replace(/\/+$/, '');
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error(`Pikoman: ${trimmed} is not an address`);
    }
    if (url.protocol === `${secure}:`) {
        return trimmed;
    }
    if (url.protocol === `${plain}:` && LOCAL_HOSTS.includes(url.hostname)) {
        return trimmed;
    }
    throw new Error(`Pikoman: ${trimmed}: use ${secure}:// (plain ${plain}:// only for localhost)`);
}

/** Whether the page is served from this machine, where trying things out with a key is safe. */
export function onLocalPage(): boolean {
    return LOCAL_HOSTS.includes((globalThis as any).location?.hostname);
}
