"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var topics_1 = require("../topics");
var AllListener = /** @class */ (function () {
    function AllListener(context) {
        this.topic = 'all';
        this.topics = new topics_1.Topics(context);
    }
    AllListener.prototype.dispatch = function (data) {
        this.topics.dispatch(this.topic, data);
    };
    AllListener.prototype.on = function (_topic, fn) {
        this.topics.on(this.topic, fn);
    };
    AllListener.prototype.clear = function () {
        this.topics.clear();
    };
    return AllListener;
}());
exports.default = AllListener;
