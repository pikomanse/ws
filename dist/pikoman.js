"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
Object.defineProperty(exports, "__esModule", { value: true });
var channel_1 = require("./channel");
var types_1 = require("./types");
var opcode_handler_1 = require("./opcode_handler");
var authenticators_1 = require("./authenticators");
var defaultOptions = {
    // 2.0 runs on next.pikoman.se until ws.pikoman.se switches over; 1.0.0 goes back to ws.pikoman.se.
    ws_address: "wss://next.pikoman.se",
};
var Pikoman = /** @class */ (function () {
    function Pikoman(appId, options) {
        if (options === void 0) { options = defaultOptions; }
        this.clientId = "";
        this.timeoutOffline = 0;
        this.timeoutSendPing = 0;
        this.timeoutReconnect = 0;
        this.status = types_1.ConnectionStatus.Loading;
        this.channels = new Map();
        this.messages = new opcode_handler_1.OpCodeHandler(this);
        this.options = defaultOptions;
        this.appId = appId;
        this.options = __assign(__assign({}, defaultOptions), options);
        this.ws = new WebSocket(this.getAppWsUrl());
        this.send = this.send.bind(this);
        this.sendPing = this.sendPing.bind(this);
        this.onOffline = this.onOffline.bind(this);
        this.bindWebSocket(this.ws);
    }
    Pikoman.prototype.bindWebSocket = function (ws) {
        ws.onopen = this.onOpen.bind(this);
        ws.onmessage = this.onMessage.bind(this);
        ws.onclose = this.onClose.bind(this);
        ws.onerror = this.onOffline.bind(this);
    };
    Pikoman.prototype.getStatus = function () {
        return this.status;
    };
    Pikoman.prototype.getOptions = function () {
        return this.options;
    };
    Pikoman.prototype.setOptions = function (options) {
        this.options = options;
    };
    Pikoman.prototype.getAuthUrl = function () {
        if (!this.options) {
            throw new Error("No auth_url");
        }
        return this.options.auth_url;
    };
    Pikoman.prototype.getAppWsUrl = function () {
        return this.options.ws_address + "/" + this.appId;
    };
    Pikoman.prototype.rejoin = function () {
        this.channels.forEach(function (channel) { return channel.join(); });
    };
    Pikoman.prototype.reconnect = function () {
        var _this = this;
        this.ws.close();
        clearTimeout(this.timeoutReconnect);
        this.timeoutReconnect = setTimeout(function () {
            var ws = new WebSocket(_this.getAppWsUrl());
            ws.onopen = function () {
                _this.ws = ws;
                _this.bindWebSocket(ws);
                _this.clearOfflineTimeout();
            };
            ws.onerror = _this.reconnect.bind(_this);
        }, 5000);
    };
    Pikoman.prototype.onMessage = function (_a) {
        var data = _a.data;
        var message;
        try {
            message = JSON.parse(data);
        }
        catch (e) {
            console.error("Pikoman: could not read message from server");
            return;
        }
        this.clearOfflineTimeout();
        switch (message.op) {
            case "connected": {
                this.client(message.id);
                break;
            }
            case "pong": {
                break;
            }
            case "error": {
                var channel = message.channel ? this.channels.get(message.channel) : undefined;
                if (channel) {
                    channel.handleError(message.code);
                }
                else {
                    console.error("Pikoman: " + message.code);
                }
                break;
            }
            default: {
                var channel = this.channels.get(message.channel);
                if (channel) {
                    channel.handle(message);
                }
            }
        }
    };
    /** A new connection id: every channel joins again, with new tokens. */
    Pikoman.prototype.client = function (clientId) {
        this.clientId = clientId;
        this.messages.dispatch(types_1.ConnectionStatus.Online, [true]);
        this.clearOfflineTimeout();
        this.rejoin();
    };
    Pikoman.prototype.onOpen = function () {
        this.status = types_1.ConnectionStatus.Online;
    };
    Pikoman.prototype.onClose = function () {
        var data = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            data[_i] = arguments[_i];
        }
        this.status = types_1.ConnectionStatus.Offline;
        this.clientId = "";
        this.messages.dispatch(types_1.ConnectionStatus.Offline, __spreadArray([false], data));
        this.reconnect();
    };
    Pikoman.prototype.onOffline = function () {
        var data = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            data[_i] = arguments[_i];
        }
        this.onClose(data);
    };
    Pikoman.prototype.clearOfflineTimeout = function () {
        clearTimeout(this.timeoutOffline);
        clearTimeout(this.timeoutSendPing);
        this.timeoutOffline = setTimeout(this.onOffline, 18500);
        this.timeoutSendPing = setTimeout(this.sendPing, 6500);
    };
    Pikoman.prototype.sendPing = function () {
        this.send({ op: "ping" });
    };
    Pikoman.prototype.getClientId = function () {
        return this.clientId;
    };
    Pikoman.prototype.state = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Offline |
            types_1.ConnectionStatus.Loading |
            types_1.ConnectionStatus.Online, fn);
    };
    Pikoman.prototype.online = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Online, fn);
    };
    Pikoman.prototype.connection = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Offline | types_1.ConnectionStatus.Online, fn);
        if (this.isConnected()) {
            fn.call(this, [true]);
        }
    };
    Pikoman.prototype.offline = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Offline, fn);
    };
    Pikoman.prototype.join = function (fn) {
        this.subscribe(fn);
    };
    Pikoman.prototype.subscribe = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Online, fn);
        if (this.isConnected()) {
            fn.call(this, this.clientId);
        }
    };
    Pikoman.prototype.isConnected = function () {
        return this.ws.readyState === WebSocket.OPEN && this.clientId !== "";
    };
    Pikoman.prototype.addChannel = function (channelName, create) {
        var existingChannel = this.channels.get(channelName);
        if (existingChannel) {
            return existingChannel;
        }
        var channel = create();
        this.channels.set(channelName, channel);
        if (this.isConnected()) {
            channel.join();
        }
        return channel;
    };
    Pikoman.prototype.listen = function (channelName) {
        var _this = this;
        if (channelName.startsWith("presence-")) {
            throw new Error("Presence channels should be listened to using the listenPresence method");
        }
        if (channelName.startsWith("private-")) {
            throw new Error("Private channels should be listened to using the listenPrivate method");
        }
        return this.addChannel(channelName, function () { return new channel_1.Channel(channelName, _this); });
    };
    Pikoman.prototype.listenPrivate = function (channelName, authenticator) {
        var _this = this;
        if (authenticator === void 0) { authenticator = new authenticators_1.HttpAuthenticator(); }
        if (!channelName.startsWith("private-")) {
            throw new Error("Private channels must start with prefix private-");
        }
        return this.addChannel(channelName, function () { return new channel_1.PrivateChannel(channelName, _this, authenticator); });
    };
    Pikoman.prototype.listenPresence = function (channelName, authenticator) {
        var _this = this;
        if (authenticator === void 0) { authenticator = new authenticators_1.HttpAuthenticator(); }
        if (!channelName.startsWith("presence-")) {
            throw new Error("Presence channels must start with prefix presence");
        }
        return this.addChannel(channelName, function () { return new channel_1.PresenceChannel(channelName, _this, authenticator); });
    };
    Pikoman.prototype.leaveChannel = function (channelName) {
        var existingChannel = this.channels.get(channelName);
        if (existingChannel) {
            this.channels.delete(channelName);
            existingChannel.leave();
            existingChannel.clear();
        }
    };
    Pikoman.prototype.send = function (message) {
        if (this.isConnected()) {
            this.ws.send(JSON.stringify(message));
        }
    };
    Pikoman.prototype.clear = function () {
        this.messages.clear();
        this.channels.clear();
    };
    return Pikoman;
}());
exports.default = Pikoman;
