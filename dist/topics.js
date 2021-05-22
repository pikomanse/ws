"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Topics = void 0;
var Topics = /** @class */ (function () {
    function Topics(context) {
        this.topics = new Map();
        this.context = context;
    }
    /**
     * Bind a observer to a specific topic
     * @param {Topic} topic
     * @param {Observer} observer
     * @returns {default}
     */
    Topics.prototype.on = function (topic, observer) {
        if (this.topics.has(topic)) {
            this.topics.set(topic, this.topics.get(topic).concat(observer));
        }
        else {
            this.topics.set(topic, [observer]);
        }
        return this;
    };
    /**
     * Get all observers for a specific topic
     * @param {Topic} topic
     * @returns {Observer[]}
     */
    Topics.prototype.getObservers = function (topic) {
        var _a;
        return (_a = this.topics.get(topic)) !== null && _a !== void 0 ? _a : [];
    };
    ;
    /**
     * Get a list of all the subscribed topics by name
     * @returns {Topic[]}
     */
    Topics.prototype.getTopics = function () {
        return Array.from(this.topics.keys());
    };
    /**
     * Get all observers
     * @returns {Observer[]}
     */
    Topics.prototype.getAllObservers = function () {
        //return Array.from(this.topics.values()).flat();
        var flatArray = function (a, b) { return a.concat(b); };
        return Array.from(this.topics.values()).reduce(flatArray, []);
    };
    /**
     * Unbind all or a specific observer for a topic
     * @param {Topic} topic
     * @param {Observer=} observer
     * @returns {default}
     */
    Topics.prototype.off = function (topic, observer) {
        if (!observer) {
            this.topics.delete(topic);
            return this;
        }
        if (!this.topics.has(topic)) {
            return this;
        }
        var filteredObservers = this.topics.get(topic).filter(function (fn) { return fn !== observer; });
        if (filteredObservers.length > 0) {
            this.topics.set(topic, filteredObservers);
        }
        else {
            this.topics.delete(topic);
        }
        return this;
    };
    Topics.prototype.clear = function () {
        this.topics.clear();
    };
    Topics.prototype.dispatch = function (topic) {
        var _this = this;
        var data = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            data[_i - 1] = arguments[_i];
        }
        this.getObservers(topic).forEach(function (fn) { return fn.apply(_this.context, data); });
    };
    return Topics;
}());
exports.Topics = Topics;
exports.default = Topics;
