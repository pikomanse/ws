"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionStatus = exports.MessageType = void 0;
var MessageType;
(function (MessageType) {
    MessageType[MessageType["Join"] = 1] = "Join";
    MessageType[MessageType["Subscribe"] = 2] = "Subscribe";
    MessageType[MessageType["Unsubscribe"] = 4] = "Unsubscribe";
    MessageType[MessageType["ClientMessage"] = 8] = "ClientMessage";
    MessageType[MessageType["ServerMessage"] = 16] = "ServerMessage";
    MessageType[MessageType["Leave"] = 32] = "Leave";
    MessageType[MessageType["Ping"] = 64] = "Ping";
})(MessageType = exports.MessageType || (exports.MessageType = {}));
var ConnectionStatus;
(function (ConnectionStatus) {
    ConnectionStatus[ConnectionStatus["Offline"] = 1] = "Offline";
    ConnectionStatus[ConnectionStatus["Loading"] = 2] = "Loading";
    ConnectionStatus[ConnectionStatus["Online"] = 4] = "Online";
})(ConnectionStatus = exports.ConnectionStatus || (exports.ConnectionStatus = {}));
