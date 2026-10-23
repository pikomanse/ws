/**
 * Kinds of callbacks a channel can dispatch. They are bit flags, so one callback can listen to
 * several (`Subscribe | Unsubscribe`). Since 1.0 they are not sent over the wire: the protocol
 * is JSON, see `ServerMessage`.
 */
export declare enum MessageType {
    Connection = 0,
    ServerMessage = 1,
    Subscribe = 2,
    Unsubscribe = 4,
    ClientMessage = 8,
    ClientsInChannel = 16,
    Refused = 32,
    Ping = 64,
    Unknown = 128
}
export declare enum ConnectionStatus {
    Offline = 1,
    Loading = 2,
    Online = 4
}
export declare type Fn = (...data: any) => void;
export interface SendData {
    send: Fn;
}
export interface MessageCallback<T extends number> {
    fn: Fn;
    type: T;
}
export interface Options {
    ws_address?: string;
    auth_url?: string;
}
/**
 * Gets a join token for a `presence-` or `private-` channel. The token is signed by the app's
 * backend; see the docs on pikoman.se.
 */
export interface Authenticator {
    authenticate: (clientId: string, channelName: string, options: Options) => Promise<string>;
}
export declare type ErrorCode = 'invalid_message' | 'join_refused' | 'too_many_channels' | 'not_allowed' | 'rate_limited';
/** Messages the client sends. */
export declare type ClientMessage = {
    op: 'join';
    channel: string;
    token?: string;
} | {
    op: 'leave';
    channel: string;
} | {
    op: 'send';
    channel: string;
    event: string;
    data: any;
    echo: boolean;
} | {
    op: 'ping';
};
/** Messages the server sends. */
export declare type ServerMessage = {
    op: 'connected';
    id: string;
} | {
    op: 'joined';
    channel: string;
} | {
    op: 'left';
    channel: string;
} | {
    op: 'members';
    channel: string;
    members: Record<string, any>;
} | {
    op: 'member_joined';
    channel: string;
    count: number;
    id: string;
    data: any;
} | {
    op: 'member_left';
    channel: string;
    count: number;
    id: string;
} | {
    op: 'event';
    channel: string;
    event?: string;
    data: any;
} | {
    op: 'client_event';
    channel: string;
    from: string;
    event: string;
    data: any;
} | {
    op: 'error';
    code: ErrorCode;
    channel?: string;
} | {
    op: 'pong';
};
export declare type ChannelMessage = Extract<ServerMessage, {
    channel: string;
}>;
export interface Listener {
    on(topic: string, fn: Fn): void;
    dispatch(event: string, data: any): void;
    clear(): void;
}
