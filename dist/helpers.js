"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitn = void 0;
function splitn(str, splitAt, nrOfSplitAtBreakpoints) {
    var currentIndex = 0;
    var strings = [];
    nrOfSplitAtBreakpoints--;
    while (nrOfSplitAtBreakpoints-- > 0 && currentIndex < str.length) {
        var nextIndex = str.indexOf(splitAt, currentIndex);
        if (nextIndex === -1) {
            break;
        }
        strings.push(str.substr(currentIndex, nextIndex - currentIndex));
        currentIndex = nextIndex + 1;
    }
    if (currentIndex < str.length) {
        strings.push(str.substr(currentIndex));
    }
    return strings;
}
exports.splitn = splitn;
