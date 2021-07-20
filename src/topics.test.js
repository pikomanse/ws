import Topics from './topics.ts';

const noop = () => {
};
describe('Topics', () => {
  it('Should be able to set up and tear down observers', () => {
    const topics = new Topics();
    const logger = (val) => console.log(`Incoming 1: ${val}`);
    const logger2 = (val) => console.log(`Incoming 1: ${val}`);

    // Setup
    topics.on('test', logger);
    topics.on('test2', logger2);
    expect(topics.getObservers('test')).toEqual([logger]);
    expect(topics.getObservers('test2')).toEqual([logger2]);

    topics.on('test', logger2);
    expect(topics.getObservers('test')).toEqual([logger, logger2]);

    // Cleanup
    expect(topics.off('test').getObservers('test')).toEqual([]);
    expect(topics.getObservers('test2')).toEqual([logger2]);
    expect(topics.getAllObservers()).toEqual([logger2]);
    expect(topics.off('test2').getAllObservers()).toEqual([]);
  });
  it('Should be able to add and remove a specific observer', () => {
    const topics = new Topics();
    const logger = (val) => console.log(`Incoming 1: ${val}`);
    const logger2 = (val) => console.log(`Incoming 2: ${val}`);

    // Setup
    topics.on('test', logger).on('test', logger2).off('test', logger);

    expect(topics.getObservers('test')).toEqual([logger2]);
    expect(
        topics.off('test', logger).getObservers('test'),
    ).toEqual([logger2]);
    expect(
        topics.off('test', logger2).getObservers('test'),
    ).toEqual([]);
  });
  describe('getTopics', () => {
    it('Should be able to get topics subscribed to', () => {
      const topics = new Topics();
      topics.on('a', noop);
      expect(topics.getTopics()).toEqual(['a']);
      topics.on('b', noop);
      expect(topics.getTopics()).toEqual(['a', 'b']);
      topics.off('a', noop);
      expect(topics.getTopics()).toEqual(['b']);
      topics.off('b', noop);
      expect(topics.getTopics()).toEqual([]);
    });
  });
});