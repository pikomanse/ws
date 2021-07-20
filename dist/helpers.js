"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitn = void 0;
function splitn(str, splitAt, nrOfSplitAtBreakpoints) {
    var currentIndex = 0;
    var strings = [];
    while (--nrOfSplitAtBreakpoints > 0) {
        var nextIndex = str.indexOf(splitAt, currentIndex);
        strings.push(str.substr(currentIndex, nextIndex - currentIndex));
        currentIndex = nextIndex + 1;
    }
    strings.push(str.substr(currentIndex));
    return strings;
}
exports.splitn = splitn;
