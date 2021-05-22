export enum MessageType {
    Connection = 0,
    ServerMessage = 1,
    Subscribe = 2,
    Unsubscribe = 4,
    ClientMessage = 8,
    Ping = 64,
    Unknown
}
export enum ConnectionStatus {
    Offline = 1,
    Loading = 2,
    Online = 4
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
    ws_address: string;
    auth_url?: string;
}
export interface Authenticator {
    authenticate: (clientId: number, channelName: string, options: Options) => Promise<string>;
}
export interface Listener {
    on(topic: string, fn: Fn): void;
    dispatch(data: string): void;
    clear(): void;
}