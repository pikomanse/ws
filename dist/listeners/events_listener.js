"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringEventsListener = void 0;
var topics_1 = __importDefault(require("../topics"));
var EventsListener = /** @class */ (function () {
    function EventsListener(context) {
        this.topics = new topics_1.default(context);
    }
    EventsListener.prototype.dispatch = function (event, data) {
        this.topics.dispatch(event, data);
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
/** Like EventsListener, but always hands the data over as a string. */
var StringEventsListener = /** @class */ (function () {
    function StringEventsListener(context) {
        this.topics = new topics_1.default(context);
    }
    StringEventsListener.prototype.dispatch = function (event, data) {
        this.topics.dispatch(event, typeof data === 'string' ? data : JSON.stringify(data));
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
