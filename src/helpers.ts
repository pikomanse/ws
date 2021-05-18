export function splitn(str: string, splitAt: string, nrOfSplitAtBreakpoints: number) {
    const splits = str.split(splitAt);
    const splitted = splits.slice(0, nrOfSplitAtBreakpoints);
    const rest = splits.slice(nrOfSplitAtBreakpoints).join(splitAt);
    return [...splitted, rest];
}