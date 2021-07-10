import { splitn } from './helpers.ts';

describe('Helpers', () => {
  const str = 'channel:event:{"hello": "world"}';
  describe('splitn', () => {
    it('Should split to two items with nrOfSplitAtBreakpoints = 1', () => {
      expect(splitn(str, ':', 1)).
          toEqual(['channel', 'event:{"hello": "world"}']);
    });
    it('Should split to three items with nrOfSplitAtBreakpoints = 2', () => {
      expect(splitn(str, ':', 2)).
          toEqual(['channel', 'event', '{"hello": "world"}']);
    });
  });
});