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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceChannel = exports.Channel = void 0;
var types_1 = require("./types");
var message_handler_1 = require("./message_handler");
var Channel = /** @class */ (function () {
    function Channel(name, pikoman) {
        this.messages = new message_handler_1.MessageHandler(this);
        this.name = name;
        this.pikoman = pikoman;
    }
    Channel.prototype.join = function () {
        this.pikoman.send("2:" + this.name);
    };
    Channel.prototype.serverMessage = function (fn) {
        this.messages.on(types_1.MessageType.ServerMessage, fn);
    };
    Channel.prototype.clear = function () {
        this.messages.clear();
    };
    return Channel;
}());
exports.Channel = Channel;
var PresenceChannel = /** @class */ (function (_super) {
    __extends(PresenceChannel, _super);
    function PresenceChannel() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    PresenceChannel.prototype.join = function () {
        var _this = this;
        (function () { return __awaiter(_this, void 0, void 0, function () {
            var clientId, authenticator, response, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        clientId = this.pikoman.getClientId();
                        authenticator = this.pikoman.getAuthenticator();
                        return [4 /*yield*/, authenticator.authenticate(clientId, this.name, this.pikoman.getOptions())];
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
    PresenceChannel.prototype.subscribe = function (fn) {
        this.messages.on(types_1.MessageType.Subscribe, fn);
    };
    PresenceChannel.prototype.clients = function (fn) {
        this.messages.on(types_1.MessageType.Subscribe | types_1.MessageType.Unsubscribe, fn);
    };
    PresenceChannel.prototype.unsubscribe = function (fn) {
        this.messages.on(types_1.MessageType.Unsubscribe, fn);
    };
    PresenceChannel.prototype.clientsCount = function (fn) {
        this.messages.on(types_1.MessageType.Subscribe | types_1.MessageType.Unsubscribe, function (event, nrOfClients) { return fn(nrOfClients); });
    };
    PresenceChannel.prototype.clientMessage = function (fn) {
        this.messages.on(types_1.MessageType.ClientMessage, fn);
    };
    PresenceChannel.prototype.send = function (data) {
        this.pikoman.send("8:" + this.name + ":" + data);
    };
    return PresenceChannel;
}(Channel));
exports.PresenceChannel = PresenceChannel;
