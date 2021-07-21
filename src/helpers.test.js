import {splitn} from './helpers.ts';

describe('Helpers', () => {
  const str = 'channel:event:{"hello": "world"}';
  describe('splitn', () => {
    it('Should split suggest-video:{"video":{"id":"mluD8kQ06NM","type":"youtube"}} correctly',
        () => {
          const data = '{"video":{"id":"mluD8kQ06NM","type":"youtube"}}';
          const input = `suggest-video:${data}`;
          expect(splitn(input, ':', 2)).toEqual(['suggest-video', data]);
        });
    it('Should split 323:client-video-play, 3 correctly',
        () => {
          const data = '323:client-video-play';
          expect(splitn(data, ':', 3)).toEqual(['323', 'client-video-play']);
        });
    it('Should split to two items with nrOfSplitAtBreakpoints = 1', () => {
      expect(splitn(str, ':', 2)).
          toEqual(['channel', 'event:{"hello": "world"}']);
    });
    it('Should split to three items with nrOfSplitAtBreakpoints = 2', () => {
      expect(splitn(str, ':', 3)).
          toEqual(['channel', 'event', '{"hello": "world"}']);
    });
  });
});