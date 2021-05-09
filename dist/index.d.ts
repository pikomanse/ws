import Pikoman from './pikoman';
import { Channel, PresenceChannel } from "./channel";
import { MessageType, ConnectionStatus, SendData as SendDataType, Authenticator, Options } from './types';
import { OfflineAuthenticator, UrlAuthenticator } from './authenticators';
export default Pikoman;
export { Channel, PresenceChannel, MessageType, ConnectionStatus, Authenticator, Options, UrlAuthenticator, OfflineAuthenticator };
export declare type SendData = SendDataType;
