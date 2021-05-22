"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var topics_1 = __importDefault(require("../topics"));
var AllListener = /** @class */ (function () {
    function AllListener(context) {
        this.topic = 'all';
        this.topics = new topics_1.default(context);
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
