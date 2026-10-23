"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionStatus = exports.MessageType = void 0;
/**
 * Kinds of callbacks a channel can dispatch. They are bit flags, so one callback can listen to
 * several (`Subscribe | Unsubscribe`). Since 1.0 they are not sent over the wire: the protocol
 * is JSON, see `ServerMessage`.
 */
var MessageType;
(function (MessageType) {
    MessageType[MessageType["Connection"] = 0] = "Connection";
    MessageType[MessageType["ServerMessage"] = 1] = "ServerMessage";
    MessageType[MessageType["Subscribe"] = 2] = "Subscribe";
    MessageType[MessageType["Unsubscribe"] = 4] = "Unsubscribe";
    MessageType[MessageType["ClientMessage"] = 8] = "ClientMessage";
    MessageType[MessageType["ClientsInChannel"] = 16] = "ClientsInChannel";
    MessageType[MessageType["Refused"] = 32] = "Refused";
    MessageType[MessageType["Ping"] = 64] = "Ping";
    MessageType[MessageType["Unknown"] = 128] = "Unknown";
})(MessageType = exports.MessageType || (exports.MessageType = {}));
var ConnectionStatus;
(function (ConnectionStatus) {
    ConnectionStatus[ConnectionStatus["Offline"] = 1] = "Offline";
    ConnectionStatus[ConnectionStatus["Loading"] = 2] = "Loading";
    ConnectionStatus[ConnectionStatus["Online"] = 4] = "Online";
})(ConnectionStatus = exports.ConnectionStatus || (exports.ConnectionStatus = {}));
