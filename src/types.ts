/**
 * Kinds of callbacks a channel can dispatch. They are bit flags, so one callback can listen to
 * several (`Subscribe | Unsubscribe`). Since 1.0 they are not sent over the wire: the protocol
 * is JSON, see `ServerMessage`.
 */
export enum MessageType {
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

export enum ConnectionStatus {
    Offline = 1,
    Loading = 2,
    Online = 4,
    /** Closed with 4403: the API key the connection signed in with was deleted. No reconnect. */
    Revoked = 8
}

export type Fn = (...data: any) => void;

export interface SendData {
    send: Fn;
}

export interface MessageCallback<T extends number> {
    fn: Fn;
    type: T
}

export interface Options {
    ws_address?: string;
    auth_url?: string;
    /**
     * When the server takes a channel away because the key that signed its token was deleted
     * (`key_revoked`), join it again with a new token: after 1 s, 2 s and 4 s, then report
     * `rejoin_failed`. On by default; `false` leaves it to the app (`channel.refused`).
     */
    rejoin_on_revoke?: boolean;
}

/**
 * A join token, and for a `private-encrypted-` channel the channel key (base64, 32 bytes), as a
 * token endpoint answers it.
 */
export interface JoinAuthorization {
    token: string;
    channel_key?: string;
}

/**
 * Gets a join token for a `presence-`, `private-` or `private-encrypted-` channel. The token is
 * signed by the app's backend; see the docs on pikoman.se. For an encrypted channel it answers
 * a `JoinAuthorization` with the channel key; otherwise the token alone is enough.
 */
export interface Authenticator {
    authenticate: (clientId: string, channelName: string, options: Options) => Promise<string | JoinAuthorization>;
}

/** Codes from the server. */
export type ErrorCode = 'invalid_message' | 'join_refused' | 'too_many_channels' | 'not_allowed' | 'rate_limited' | 'not_encrypted'
    | 'channel_full' | 'member_data_too_large' | 'key_revoked';

/**
 * Codes `refused` also reports from the client itself, in encrypted channels: a message that did
 * not decrypt (dropped), or a join without a channel key (not sent).
 */
export type ClientErrorCode = 'decrypt_failed' | 'no_channel_key' | 'rejoin_failed';

/** Messages the client sends. */
export type ClientMessage =
    | { op: 'join', channel: string, token?: string }
    | { op: 'leave', channel: string }
    | { op: 'send', channel: string, event: string, data: any, echo: boolean }
    | { op: 'ping' };

/** Messages the server sends. */
export type ServerMessage =
    | { op: 'connected', id: string }
    | { op: 'joined', channel: string }
    | { op: 'left', channel: string }
    | { op: 'members', channel: string, members: Record<string, any>, bots?: Record<string, string> }
    | { op: 'member_joined', channel: string, count: number, id: string, data: any, bot?: string }
    | { op: 'member_left', channel: string, count: number, id: string }
    | { op: 'event', channel: string, event?: string, data: any }
    | { op: 'client_event', channel: string, from: string, event: string, data: any }
    | { op: 'error', code: ErrorCode, channel?: string }
    | { op: 'pong' };

export type ChannelMessage = Extract<ServerMessage, { channel: string }>;

export interface Listener {
    on(topic: string, fn: Fn): void;

    dispatch(event: string, data: any): void;

    clear(): void;
}
