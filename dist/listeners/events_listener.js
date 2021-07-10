"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringEventsListener = void 0;
var topics_1 = __importDefault(require("../topics"));
var helpers_1 = require("../helpers");
var EventsListener = /** @class */ (function () {
    function EventsListener(context) {
        this.topics = new topics_1.default(context);
    }
    EventsListener.prototype.dispatch = function (data) {
        if (data.length === 0) {
            return;
        }
        var _a = helpers_1.splitn(data, ":", 1), eventName = _a[0], rest = _a[1];
        try {
            this.topics.dispatch(eventName, JSON.parse(rest));
        }
        catch (e) {
            console.error("EventsListener couldn't parse data as JSON");
        }
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
var StringEventsListener = /** @class */ (function () {
    function StringEventsListener(context) {
        this.topics = new topics_1.default(context);
    }
    StringEventsListener.prototype.dispatch = function (data) {
        if (data.length === 0) {
            return;
        }
        var _a = helpers_1.splitn(data, ":", 1), eventName = _a[0], rest = _a[1];
        this.topics.dispatch(eventName, rest);
    };
    StringEventsListener.prototype.on = function (topic, fn) {
        this.topics.on(topic, fn);
    };
    StringEventsListener.prototype.clear = function () {
        this.topics.clear();
    };
    return StringEventsListener;
}());
exports.StringEventsListener = StringEventsListener;
