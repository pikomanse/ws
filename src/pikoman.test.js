import Pikoman from './pikoman';
import sinon from 'sinon';
import {AllEvents} from './channel';

describe('Pikoman', () => {
  describe('Events', () => {
    it('Should support clientMessages with event names', (resolve) => {
      const channelName = 'presence-test';
      const eventName = 'event-name';
      const pikoman = new Pikoman();
      const data = `8:${channelName}:15:${eventName}:hello`;
      const channel = pikoman.listenPresence(channelName);
      const spy = sinon.spy();
      channel.messages.on(eventName, spy);
      channel.messages.on(eventName, (...args) => {
        expect(spy.called).toBe(true);
        expect(args).toEqual(['15', 'hello']);
        resolve();
      });
      pikoman.onMessage({
        data,
      });
    });
    it('Should not send clientMessages with event names to events not listened to',
        (resolve) => {
          const channelName = 'presence-test';
          const eventName = 'event-name';
          const pikoman = new Pikoman();
          const data = `8:${channelName}:15:${eventName}:hello`;
          const channel = pikoman.listenPresence(channelName);
          const spy = sinon.spy();
          channel.messages.on('bogus', spy);
          channel.messages.on(eventName, (...args) => {
            expect(spy.called).toBe(false);
            expect(args).toEqual(['15', 'hello']);
            resolve();
          });
          pikoman.onMessage({
            data,
          });
        });
    it('Should support clientMessages without event names', (resolve) => {
      const channelName = 'presence-test';
      const eventName = 'event-name';
      const pikoman = new Pikoman();
      const data = `8:${channelName}:15:${eventName}:hello`;
      const channel = pikoman.listenPresence(channelName);
      channel.clientMessage((...args) => {
        expect(args).toEqual(['15', `${eventName}:hello`]);
        resolve();
      });
      pikoman.onMessage({
        data,
      });
    });
  });
  describe('RawMessages (should catch all events)', () => {
    it('Should support clientMessages with event names', (resolve) => {
      const channelName = 'presence-test';
      const eventName = 'event-name';
      const pikoman = new Pikoman();
      const data = `8:${channelName}:15:${eventName}:hello`;
      const channel = pikoman.listenPresence(channelName);
      channel.setEventsHandler(new AllEvents());
      const spy = sinon.spy();
      channel.messages.on(eventName, spy);
      channel.messages.on(eventName, (...args) => {
        expect(args).toEqual(['15', `${eventName}:hello`]);
        expect(spy.called).toBe(true);
        resolve();
      });
      pikoman.onMessage({
        data,
      });
    });
    it('Should send clientMessages with event names to events not listened to',
        (resolve) => {
          const channelName = 'presence-test';
          const eventName = 'event-name';
          const pikoman = new Pikoman();
          const data = `8:${channelName}:15:${eventName}:hello`;
          const channel = pikoman.listenPresence(channelName);
          channel.setEventsHandler(new AllEvents());
          const spy = sinon.spy();
          channel.messages.on('bogus', spy);
          channel.messages.on(eventName, (...args) => {
            expect(args).toEqual(['15', `${eventName}:hello`]);
            expect(spy.called).toBe(true);
            resolve();
          });
          pikoman.onMessage({
            data,
          });
        });
    it('Should support clientMessages without event names', (resolve) => {
      const channelName = 'presence-test';
      const eventName = 'event-name';
      const pikoman = new Pikoman();
      const data = `8:${channelName}:15:${eventName}:hello`;
      const channel = pikoman.listenPresence(channelName);
      channel.setEventsHandler(new AllEvents());
      channel.clientMessage((...args) => {
        expect(args).toEqual(['15', `${eventName}:hello`]);
        resolve();
      });
      pikoman.onMessage({
        data,
      });
    });
  });
});