"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceChannel = exports.PrivateChannel = exports.Channel = exports.AllEvents = exports.EventsHandler = void 0;
var types_1 = require("./types");
var opcode_handler_1 = require("./opcode_handler");
var authenticators_1 = require("./authenticators");
var topics_1 = __importDefault(require("./topics"));
/** Calls `on(event, fn)` listeners with the event's data (and the sender, for client events). */
var EventsHandler = /** @class */ (function () {
    function EventsHandler(context) {
        this.topics = new topics_1.default(context);
    }
    EventsHandler.prototype.setContext = function (context) {
        this.topics.setContext(context);
    };
    EventsHandler.prototype.dispatchClient = function (event, from, data) {
        this.topics.dispatch(event, from, data);
        return this;
    };
    EventsHandler.prototype.dispatch = function (event, data) {
        this.topics.dispatch(event, data);
        return this;
    };
    EventsHandler.prototype.on = function (event, fn) {
        this.topics.on(event, fn);
        return this;
    };
    EventsHandler.prototype.off = function (event, fn) {
        this.topics.off(event, fn);
        return this;
    };
    return EventsHandler;
}());
exports.EventsHandler = EventsHandler;
/** Calls every listener for every event, whatever name it was registered with. */
var AllEvents = /** @class */ (function () {
    function AllEvents(context) {
        this.catchAllEvent = "all";
        this.topics = new topics_1.default(context);
    }
    AllEvents.prototype.setContext = function (context) {
        this.topics.setContext(context);
    };
    AllEvents.prototype.dispatchClient = function (event, from, data) {
        this.topics.dispatch(this.catchAllEvent, from, event, data);
        return this;
    };
    AllEvents.prototype.dispatch = function (event, data) {
        this.topics.dispatch(this.catchAllEvent, event, data);
        return this;
    };
    AllEvents.prototype.on = function (_event, fn) {
        this.topics.on(this.catchAllEvent, fn);
        return this;
    };
    AllEvents.prototype.off = function (_event, fn) {
        this.topics.off(this.catchAllEvent, fn);
        return this;
    };
    return AllEvents;
}());
exports.AllEvents = AllEvents;
/** A public channel: anyone with the app id can listen. */
var Channel = /** @class */ (function () {
    function Channel(name, pikoman) {
        this.opcodes = new opcode_handler_1.OpCodeHandler(this);
        this.messages = new EventsHandler(this);
        this.name = name;
        this.pikoman = pikoman;
    }
    Channel.prototype.getName = function () {
        return this.name;
    };
    Channel.prototype.setEventsHandler = function (eventsHandler) {
        eventsHandler.setContext(this);
        this.messages = eventsHandler;
    };
    Channel.prototype.join = function () {
        this.pikoman.send({ op: "join", channel: this.name });
    };
    Channel.prototype.leave = function () {
        this.pikoman.send({ op: "leave", channel: this.name });
        this.pikoman.leaveChannel(this.name);
    };
    /** Every event published to the channel over HTTP: `fn(data, event)`. */
    Channel.prototype.serverMessage = function (fn) {
        this.opcodes.on(types_1.MessageType.ServerMessage, fn);
    };
    /** The server refused to let this connection join: `fn(code)`. */
    Channel.prototype.refused = function (fn) {
        this.opcodes.on(types_1.MessageType.Refused, fn);
    };
    Channel.prototype.clear = function () {
        this.opcodes.clear();
    };
    Channel.prototype.on = function (event, fn) {
        this.messages.on(event, fn);
        return this;
    };
    Channel.prototype.off = function (event, fn) {
        this.messages.off(event, fn);
        return this;
    };
    Channel.prototype.handle = function (message) {
        switch (message.op) {
            case "event": {
                if (message.event !== undefined) {
                    this.messages.dispatch(message.event, message.data);
                }
                this.opcodes.dispatch(types_1.MessageType.ServerMessage, [message.data, message.event]);
                break;
            }
            case "joined": {
                this.opcodes.dispatch(types_1.MessageType.Subscribe, [types_1.MessageType.Subscribe]);
                break;
            }
            case "left": {
                this.opcodes.dispatch(types_1.MessageType.Unsubscribe, [types_1.MessageType.Unsubscribe]);
                break;
            }
            default: {
                this.opcodes.dispatch(types_1.MessageType.Unknown, [message]);
            }
        }
    };
    Channel.prototype.handleError = function (code) {
        if (code === "join_refused") {
            console.error("Pikoman: not allowed to join " + this.name);
        }
        this.opcodes.dispatch(types_1.MessageType.Refused, [code]);
    };
    return Channel;
}());
exports.Channel = Channel;
/**
 * A `private-` channel: joining needs a token from the app's backend, and connections with
 * write access can send client events to each other.
 */
var PrivateChannel = /** @class */ (function (_super) {
    __extends(PrivateChannel, _super);
    function PrivateChannel(name, pikoman, authenticator) {
        if (authenticator === void 0) { authenticator = new authenticators_1.HttpAuthenticator(); }
        var _this = _super.call(this, name, pikoman) || this;
        _this.authenticator = authenticator;
        return _this;
    }
    PrivateChannel.prototype.join = function () {
        var _this = this;
        (function () { return __awaiter(_this, void 0, void 0, function () {
            var token, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.authenticator.authenticate(this.pikoman.getClientId(), this.name, this.pikoman.getOptions())];
                    case 1:
                        token = _a.sent();
                        this.pikoman.send({ op: "join", channel: this.name, token: token });
                        return [3 /*break*/, 3];
                    case 2:
                        e_1 = _a.sent();
                        console.error("Pikoman: " + e_1.message);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); })();
    };
    /** Client events from other connections: `fn(clientId, event, data)`. */
    PrivateChannel.prototype.clientMessage = function (fn) {
        this.opcodes.on(types_1.MessageType.ClientMessage, fn);
    };
    PrivateChannel.prototype.handle = function (message) {
        if (message.op === "client_event") {
            this.messages.dispatchClient(message.event, message.from, message.data);
            this.opcodes.dispatch(types_1.MessageType.ClientMessage, [message.from, message.event, message.data]);
            return;
        }
        _super.prototype.handle.call(this, message);
    };
    /** `toAll` also delivers the event to this connection. */
    PrivateChannel.prototype.send = function (event, data, toAll) {
        if (toAll === void 0) { toAll = false; }
        this.pikoman.send({
            op: "send",
            channel: this.name,
            event: event,
            data: data === undefined ? null : data,
            echo: toAll,
        });
    };
    return PrivateChannel;
}(Channel));
exports.PrivateChannel = PrivateChannel;
/** A `presence-` channel: a private channel that also keeps track of who is in it. */
var PresenceChannel = /** @class */ (function (_super) {
    __extends(PresenceChannel, _super);
    function PresenceChannel() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.membersMap = new Map();
        return _this;
    }
    Object.defineProperty(PresenceChannel.prototype, "me", {
        get: function () {
            return this.getMember(this.pikoman.getClientId());
        },
        enumerable: false,
        configurable: true
    });
    PresenceChannel.prototype.getMembers = function () {
        return this.membersMap;
    };
    PresenceChannel.prototype.addMember = function (userId, data) {
        this.membersMap.set(userId, data);
    };
    PresenceChannel.prototype.removeMember = function (userId) {
        this.membersMap.delete(userId);
    };
    PresenceChannel.prototype.getMember = function (userId) {
        return this.membersMap.get(userId);
    };
    PresenceChannel.prototype.setMembers = function (members) {
        this.membersMap = members;
    };
    /** Someone joined: `fn(MessageType.Subscribe, count, clientId, data)`. */
    PresenceChannel.prototype.subscribe = function (fn) {
        this.opcodes.on(types_1.MessageType.Subscribe, fn);
    };
    /** The member list changed: `fn(members)`. */
    PresenceChannel.prototype.members = function (fn) {
        this.opcodes.on(types_1.MessageType.ClientsInChannel, fn);
    };
    /** Someone joined or left: `fn(MessageType.Subscribe | MessageType.Unsubscribe, count, clientId, data?)`. */
    PresenceChannel.prototype.clients = function (fn) {
        this.opcodes.on(types_1.MessageType.Subscribe | types_1.MessageType.Unsubscribe, fn);
    };
    /** Someone left: `fn(MessageType.Unsubscribe, count, clientId)`. */
    PresenceChannel.prototype.unsubscribe = function (fn) {
        this.opcodes.on(types_1.MessageType.Unsubscribe, fn);
    };
    PresenceChannel.prototype.clientsCount = function (fn) {
        this.opcodes.on(types_1.MessageType.Subscribe | types_1.MessageType.Unsubscribe, function (_event, nrOfClients) { return fn(nrOfClients); });
    };
    PresenceChannel.prototype.handle = function (message) {
        switch (message.op) {
            case "joined": {
                // Wait for member_joined, which says who joined.
                break;
            }
            case "member_joined": {
                this.addMember(message.id, message.data);
                this.opcodes.dispatch(types_1.MessageType.Subscribe, [
                    types_1.MessageType.Subscribe,
                    message.count,
                    message.id,
                    message.data,
                ]);
                this.opcodes.dispatch(types_1.MessageType.ClientsInChannel, [this.getMembers()]);
                break;
            }
            case "member_left": {
                this.removeMember(message.id);
                this.opcodes.dispatch(types_1.MessageType.Unsubscribe, [
                    types_1.MessageType.Unsubscribe,
                    message.count,
                    message.id,
                ]);
                this.opcodes.dispatch(types_1.MessageType.ClientsInChannel, [this.getMembers()]);
                break;
            }
            case "members": {
                this.setMembers(new Map(Object.entries(message.members)));
                this.opcodes.dispatch(types_1.MessageType.ClientsInChannel, [this.getMembers()]);
                break;
            }
            default: {
                _super.prototype.handle.call(this, message);
            }
        }
    };
    return PresenceChannel;
}(PrivateChannel));
exports.PresenceChannel = PresenceChannel;
