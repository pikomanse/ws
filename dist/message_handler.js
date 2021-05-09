"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
var MessageHandler = /** @class */ (function () {
    function MessageHandler(context) {
        this.messages = Array();
        this.context = context;
    }
    MessageHandler.prototype.filterCallbacksArray = function (array, type) {
        return array
            .filter(function (x) { return (type & x.type) === type; })
            .map(function (_a) {
            var fn = _a.fn;
            return fn;
        });
    };
    // @ts-ignore
    MessageHandler.prototype.applyThis = function (context, data) {
        return function (callback) { return callback.apply(context, data); };
    };
    MessageHandler.prototype.on = function (type, fn) {
        this.messages.push({
            fn: fn,
            type: type
        });
    };
    MessageHandler.prototype.clear = function () {
        this.messages = [];
    };
    MessageHandler.prototype.dispatch = function (type, data) {
        if (data === void 0) { data = []; }
        this.filterCallbacksArray(this.messages, type)
            .forEach(this.applyThis(this.context, data));
    };
    return MessageHandler;
}());
exports.MessageHandler = MessageHandler;
