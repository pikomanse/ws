export declare enum MessageType {
    Join = 1,
    Subscribe = 2,
    Unsubscribe = 4,
    ClientMessage = 8,
    ServerMessage = 16,
    Leave = 32,
    Ping = 64
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
    ws_address: string;
    auth_url?: string;
}
export interface Authenticator {
    authenticate: (channelName: string, options: Options) => Promise<string>;
}
