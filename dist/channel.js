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
exports.PresenceChannel = exports.Channel = exports.AllEvents = exports.EventsHandler = void 0;
var types_1 = require("./types");
var opcode_handler_1 = require("./opcode_handler");
var authenticators_1 = require("./authenticators");
var topics_1 = __importDefault(require("./topics"));
var helpers_1 = require("./helpers");
var EventsHandler = /** @class */ (function () {
    function EventsHandler(context) {
        this.context = context;
        this.topics = new topics_1.default(context);
    }
    EventsHandler.prototype.setContext = function (context) {
        this.topics.setContext(context);
        this.context = context;
    };
    EventsHandler.prototype.dispatchClient = function (args) {
        var _a = helpers_1.splitn(args, ":", 3), _b = _a[0], id = _b === void 0 ? 0 : _b, _c = _a[1], event = _c === void 0 ? 'all' : _c, rest = _a[2];
        try {
            this.topics.dispatch(event, id, JSON.parse(rest));
        }
        catch (e) {
            this.topics.dispatch(event, id, rest);
        }
        return this;
    };
    EventsHandler.prototype.dispatch = function (args) {
        var _a = helpers_1.splitn(args, ":", 2), _b = _a[0], event = _b === void 0 ? 'all' : _b, rest = _a[1];
        try {
            this.topics.dispatch(event, JSON.parse(rest));
        }
        catch (e) {
            this.topics.dispatch(event, rest);
        }
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
var AllEvents = /** @class */ (function () {
    function AllEvents(context) {
        this.catchAllEvent = 'all';
        this.context = context;
        this.topics = new topics_1.default(context);
    }
    AllEvents.prototype.setContext = function (context) {
        this.topics.setContext(context);
        this.context = context;
    };
    AllEvents.prototype.dispatchClient = function (args) {
        var _a = helpers_1.splitn(args, ":", 2), _b = _a[0], id = _b === void 0 ? 0 : _b, rest = _a[1];
        this.topics.dispatch(this.catchAllEvent, id, rest);
        return this;
    };
    AllEvents.prototype.dispatch = function (args) {
        this.topics.dispatch(this.catchAllEvent, args);
        return this;
    };
    AllEvents.prototype.on = function (_event, fn) {
        this.topics.on(this.catchAllEvent, fn);
        return this;
    };
    AllEvents.prototype.off = function (event, fn) {
        this.topics.off(this.catchAllEvent, fn);
        return this;
    };
    return AllEvents;
}());
exports.AllEvents = AllEvents;
var Channel = /** @class */ (function () {
    function Channel(name, pikoman) {
        this.opcodes = new opcode_handler_1.OpCodeHandler(this);
        this.messages = new EventsHandler(this);
        this.name = name;
        this.pikoman = pikoman;
    }
    Channel.prototype.setEventsHandler = function (eventsHandler) {
        eventsHandler.setContext(this);
        this.messages = eventsHandler;
    };
    Channel.prototype.join = function () {
        this.pikoman.send("2:" + this.name);
    };
    Channel.prototype.leave = function () {
        this.pikoman.send("4:" + this.name);
    };
    Channel.prototype.serverMessage = function (fn) {
        this.opcodes.on(types_1.MessageType.ServerMessage, fn);
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
    Channel.prototype.dispatch = function (opcode, data) {
        switch (opcode) {
            case types_1.MessageType.ServerMessage: {
                this.messages.dispatch(data);
                this.opcodes.dispatch(types_1.MessageType.ServerMessage, [data]);
                break;
            }
            case types_1.MessageType.Subscribe: {
                this.opcodes.dispatch(types_1.MessageType.Subscribe, [types_1.MessageType.Subscribe]);
                break;
            }
            case types_1.MessageType.Unsubscribe: {
                this.opcodes.dispatch(types_1.MessageType.Unsubscribe, [types_1.MessageType.Unsubscribe]);
                break;
            }
            default: {
                this.opcodes.dispatch(types_1.MessageType.Unknown, [data]);
            }
        }
    };
    return Channel;
}());
exports.Channel = Channel;
var PresenceChannel = /** @class */ (function (_super) {
    __extends(PresenceChannel, _super);
    function PresenceChannel(name, pikoman, authenticator) {
        if (authenticator === void 0) { authenticator = new authenticators_1.HttpAuthenticator(); }
        var _this = _super.call(this, name, pikoman) || this;
        _this.membersMap = new Map();
        _this.authenticator = authenticator;
        return _this;
    }
    PresenceChannel.prototype.join = function () {
        var _this = this;
        (function () { return __awaiter(_this, void 0, void 0, function () {
            var clientId, response, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        clientId = this.pikoman.getClientId();
                        return [4 /*yield*/, this.authenticator.authenticate(clientId, this.name, this.pikoman.getOptions())];
                    case 1:
                        response = _a.sent();
                        this.pikoman.send(response);
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
    PresenceChannel.prototype.subscribe = function (fn) {
        this.opcodes.on(types_1.MessageType.Subscribe, fn);
    };
    PresenceChannel.prototype.members = function (fn) {
        this.opcodes.on(types_1.MessageType.ClientsInChannel, fn);
    };
    PresenceChannel.prototype.clients = function (fn) {
        this.opcodes.on(types_1.MessageType.Subscribe | types_1.MessageType.Unsubscribe, fn);
    };
    PresenceChannel.prototype.unsubscribe = function (fn) {
        this.opcodes.on(types_1.MessageType.Unsubscribe, fn);
    };
    PresenceChannel.prototype.clientsCount = function (fn) {
        this.opcodes.on(types_1.MessageType.Subscribe | types_1.MessageType.Unsubscribe, function (event, nrOfClients) { return fn(nrOfClients); });
    };
    PresenceChannel.prototype.clientMessage = function (fn) {
        this.opcodes.on(types_1.MessageType.ClientMessage, function (data) {
            var _a = helpers_1.splitn(data, ':', 2), clientId = _a[0], msg = _a[1];
            fn(clientId, msg);
        });
    };
    PresenceChannel.prototype.dispatch = function (opcode, data) {
        switch (opcode) {
            case types_1.MessageType.Subscribe: {
                var _a = helpers_1.splitn(data, ':', 3), nrOfUsers = _a[0], _b = _a[1], userId = _b === void 0 ? '' : _b, _c = _a[2], userData = _c === void 0 ? '{}' : _c;
                this.addMember(userId, userData);
                this.opcodes.dispatch(types_1.MessageType.Subscribe, [types_1.MessageType.Subscribe, parseInt(nrOfUsers, 10), userId, JSON.parse(userData)]);
                this.opcodes.dispatch(types_1.MessageType.ClientsInChannel, [this.getMembers()]);
                break;
            }
            case types_1.MessageType.Unsubscribe: {
                var _d = helpers_1.splitn("" + data, ':', 2), nrOfUsers = _d[0], userId = _d[1];
                this.removeMember(userId);
                this.opcodes.dispatch(types_1.MessageType.Unsubscribe, [types_1.MessageType.Unsubscribe, parseInt(nrOfUsers, 10), userId]);
                this.opcodes.dispatch(types_1.MessageType.ClientsInChannel, [this.getMembers()]);
                break;
            }
            case types_1.MessageType.ClientMessage: {
                this.messages.dispatchClient(data);
                this.opcodes.dispatch(types_1.MessageType.ClientMessage, [data]);
                break;
            }
            case types_1.MessageType.ClientsInChannel: {
                var members = new Map(Object.entries(JSON.parse(data)));
                this.setMembers(members);
                this.opcodes.dispatch(types_1.MessageType.ClientsInChannel, [members]);
                this.opcodes.dispatch(types_1.MessageType.Subscribe, [types_1.MessageType.Subscribe, Array.from(this.getMembers().keys()).length, this.pikoman.getClientId(), JSON.parse(this.getMember(this.pikoman.getClientId()))]);
                break;
            }
            default: {
                _super.prototype.dispatch.call(this, opcode, data);
            }
        }
    };
    PresenceChannel.prototype.send = function (event, data, toAll) {
        if (toAll === void 0) { toAll = false; }
        if (data) {
            this.pikoman.send(types_1.MessageType.ClientMessage + ":" + this.name + ":" + Number(toAll) + ":" + event + ":" + JSON.stringify(data));
        }
        else {
            this.pikoman.send(types_1.MessageType.ClientMessage + ":" + this.name + ":" + Number(toAll) + ":" + event);
        }
    };
    return PresenceChannel;
}(Channel));
exports.PresenceChannel = PresenceChannel;
