"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpCodeHandler = void 0;
var OpCodeHandler = /** @class */ (function () {
    function OpCodeHandler(context) {
        this.messages = Array();
        this.context = context;
    }
    OpCodeHandler.prototype.filterCallbacksArray = function (array, type) {
        return array
            .filter(function (x) { return (type & x.type) === type; })
            .map(function (_a) {
            var fn = _a.fn;
            return fn;
        });
    };
    // @ts-ignore
    OpCodeHandler.prototype.applyThis = function (context, data) {
        return function (callback) { return callback.apply(context, data); };
    };
    OpCodeHandler.prototype.on = function (type, fn) {
        this.messages.push({
            fn: fn,
            type: type
        });
    };
    OpCodeHandler.prototype.clear = function () {
        this.messages = [];
    };
    OpCodeHandler.prototype.dispatch = function (type, data) {
        if (data === void 0) { data = []; }
        this.filterCallbacksArray(this.messages, type)
            .forEach(this.applyThis(this.context, data));
    };
    return OpCodeHandler;
}());
exports.OpCodeHandler = OpCodeHandler;
