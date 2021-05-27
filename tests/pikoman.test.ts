import sinon from 'sinon';
import Pikoman from '../src/pikoman';
import {splitn} from "../src/helpers";
import {MessageType} from "../src/types";
// @ts-ignore

describe(`Pikoman`, () => {
    describe(`splitn`, () => {
        it(`Should split message accordingly`, () => {
            const input = `8:presence-test:122:testing :)`;
            const expectedResult = ['8', 'presence-test', '122', 'testing :)'];
            const result = splitn(input, ':', 3);
            expect(result).toEqual(expectedResult);
        });
    });
    it(`Should call subscribe fn`, () => {
        const expectedResult = [MessageType.Subscribe, '1', 'data'];
        const pikoman = new Pikoman();
        const channel = pikoman.listenPresence(`presence-test`);
        const spy = sinon.spy();
        channel.subscribe(spy);
        channel.opcodes.dispatch(MessageType.Subscribe, expectedResult);
        expect(spy.getCall(0).args).toEqual(expectedResult);
    });
    it(`Should call message fn`, () => {
        const expectedResult = ['2', 'data'];
        const pikoman = new Pikoman();
        const channel = pikoman.listenPresence(`presence-test`);
        const spy = sinon.spy();
        channel.clientMessage(spy);
        channel.opcodes.dispatch(MessageType.ClientMessage, expectedResult);
        expect(spy.getCall(0).args).toEqual(expectedResult);
    });
    it(`Should call clients fn upon join`, () => {
        const expectedResult = [MessageType.Subscribe, '2', 'data'];
        const pikoman = new Pikoman();
        const channel = pikoman.listenPresence(`presence-test`);
        const spy = sinon.spy();
        channel.clients(spy);
        channel.opcodes.dispatch(MessageType.Subscribe, expectedResult);
        expect(spy.getCall(0).args).toEqual(expectedResult);
    });
    it(`Should call clients fn upon leave`, () => {
        const expectedResult = [MessageType.Unsubscribe, '2', 'data'];
        const pikoman = new Pikoman();
        const channel = pikoman.listenPresence(`presence-test`);
        const spy = sinon.spy();
        channel.clients(spy);
        channel.opcodes.dispatch(MessageType.Subscribe, expectedResult);
        expect(spy.getCall(0).args).toEqual(expectedResult);
    });
});