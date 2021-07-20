export function splitn(str: string, splitAt: string, nrOfSplitAtBreakpoints: number) {
    let currentIndex = 0;
    let strings = [];
    while (--nrOfSplitAtBreakpoints > 0) {
        const nextIndex = str.indexOf(splitAt, currentIndex);
        strings.push(str.substr(currentIndex, nextIndex - currentIndex));
        currentIndex = nextIndex + 1;
    }
    strings.push(str.substr(currentIndex));

    return strings;
}