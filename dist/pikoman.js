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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var channel_1 = require("./channel");
var helpers_1 = require("./helpers");
var types_1 = require("./types");
var message_handler_1 = require("./message_handler");
var url_authenticator_1 = __importDefault(require("./authenticators/url_authenticator"));
var defaultOptions = {
    ws_address: 'wss://ws.pikoman.se',
};
var Pikoman = /** @class */ (function () {
    function Pikoman(appId, options) {
        if (options === void 0) { options = defaultOptions; }
        this.clientId = -1;
        this.timeoutOffline = 0;
        this.timeoutSendPing = 0;
        this.timeoutReconnect = 0;
        this.status = types_1.ConnectionStatus.Loading;
        this.channels = new Map();
        this.messages = new message_handler_1.MessageHandler(this);
        this.options = defaultOptions;
        this.authenticator = new url_authenticator_1.default();
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
    Pikoman.prototype.getAuthenticator = function () {
        return this.authenticator;
    };
    Pikoman.prototype.setAuthenticator = function (authenticator) {
        this.authenticator = authenticator;
    };
    Pikoman.prototype.getOptions = function () {
        return this.options;
    };
    Pikoman.prototype.setOptions = function (options) {
        this.options = options;
    };
    Pikoman.prototype.getAuthUrl = function () {
        if (!this.options) {
            throw new Error('No auth_url');
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
                _this.rejoin();
            };
            ws.onerror = _this.reconnect.bind(_this);
        }, 5000);
    };
    Pikoman.prototype.onMessage = function (_a) {
        var data = _a.data;
        switch (parseInt(data.substring(0, data.indexOf(':')), 10)) {
            case 0: {
                var _b = helpers_1.splitn("" + data, ':', 1), _opcode = _b[0], clientIdStr = _b[1];
                var clientId = parseInt(clientIdStr, 10) || -1;
                this.client(clientId);
                break;
            }
            case types_1.MessageType.Join: {
                var _c = helpers_1.splitn("" + data, ':', 2), _opcode = _c[0], channelName = _c[1], rest = _c.slice(2);
                var channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatch(types_1.MessageType.ServerMessage, rest);
                break;
            }
            case types_1.MessageType.Subscribe: {
                var _d = helpers_1.splitn("" + data, ':', 4), _opcode = _d[0], channelName = _d[1], nrOfUsers = _d[2], userId = _d[3], userData = _d[4];
                var channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatch(types_1.MessageType.Subscribe, [types_1.MessageType.Subscribe, parseInt(nrOfUsers, 10), userId, JSON.parse(userData)]);
                break;
            }
            case types_1.MessageType.Unsubscribe: {
                var _e = helpers_1.splitn("" + data, ':', 3), _opcode = _e[0], channelName = _e[1], nrOfUsers = _e[2], userId = _e[3];
                var channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatch(types_1.MessageType.Unsubscribe, [types_1.MessageType.Unsubscribe, parseInt(nrOfUsers, 10), userId]);
                break;
            }
            case types_1.MessageType.ClientMessage: {
                var _f = helpers_1.splitn("" + data, ':', 3), _opcode = _f[0], channelName = _f[1], rest = _f.slice(2);
                var channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatch(types_1.MessageType.ClientMessage, rest);
                break;
            }
            case types_1.MessageType.Ping: {
                this.clearOfflineTimeout();
                break;
            }
            default: {
                var _g = helpers_1.splitn("" + data, ':', 3), _opcode = _g[0], channelName = _g[1], rest = _g.slice(2);
                var channel = this.channels.get(channelName);
                if (!channel) {
                    return;
                }
                channel.messages.dispatch(types_1.MessageType.Leave, rest);
            }
        }
    };
    Pikoman.prototype.client = function (clientId) {
        this.clientId = clientId;
        this.messages.dispatch(types_1.ConnectionStatus.Online, [true]);
        this.rejoin();
    };
    Pikoman.prototype.onOpen = function () {
        this.status = types_1.ConnectionStatus.Online;
        this.messages.dispatch(types_1.ConnectionStatus.Online, [true]);
        this.clearOfflineTimeout();
    };
    Pikoman.prototype.onClose = function () {
        var data = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            data[_i] = arguments[_i];
        }
        this.status = types_1.ConnectionStatus.Offline;
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
        this.timeoutSendPing = setTimeout(this.sendPing, 3500);
    };
    Pikoman.prototype.sendPing = function () {
        this.send("64:" + new Date().getTime());
    };
    Pikoman.prototype.getClientId = function () {
        return this.clientId;
    };
    Pikoman.prototype.state = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Offline | types_1.ConnectionStatus.Loading | types_1.ConnectionStatus.Online, fn);
    };
    Pikoman.prototype.online = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Online, fn);
    };
    Pikoman.prototype.connection = function (fn) {
        this.messages.on(types_1.ConnectionStatus.Offline | types_1.ConnectionStatus.Online, fn);
        if (this.status === types_1.ConnectionStatus.Online) {
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
        if (this.status === types_1.ConnectionStatus.Online) {
            fn.call(this, this.clientId);
        }
    };
    Pikoman.prototype.listen = function (channelName) {
        var existingChannel = this.channels.get(channelName);
        if (existingChannel) {
            return existingChannel;
        }
        var channel = channelName.startsWith('presence-') ? new channel_1.PresenceChannel(channelName, this) : new channel_1.Channel(channelName, this);
        this.channels.set(channelName, channel);
        return channel;
    };
    Pikoman.prototype.send = function (data) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        this.ws.send(data);
    };
    Pikoman.prototype.clear = function () {
        this.messages.clear();
        this.channels.clear();
    };
    return Pikoman;
}());
exports.default = Pikoman;
