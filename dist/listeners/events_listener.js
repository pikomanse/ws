"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var topics_1 = require("../topics");
var EventsListener = /** @class */ (function () {
    function EventsListener(context) {
        this.topics = new topics_1.Topics(context);
    }
    EventsListener.prototype.dispatch = function (data) {
        if (data.length === 0) {
            return;
        }
        var _a = data.split(':'), eventName = _a[0], rest = _a.slice(1);
        this.topics.dispatch(eventName, rest);
    };
    EventsListener.prototype.on = function (topic, fn) {
        this.topics.on(topic, fn);
    };
    EventsListener.prototype.clear = function () {
        this.topics.clear();
    };
    return EventsListener;
}());
exports.default = EventsListener;
