export function splitn(str: string, splitAt: string, nrOfSplitAtBreakpoints: number) {
    let currentIndex = 0;
    let strings = [];
    nrOfSplitAtBreakpoints--;
    while (nrOfSplitAtBreakpoints-- > 0 && currentIndex < str.length) {
        const nextIndex = str.indexOf(splitAt, currentIndex);
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