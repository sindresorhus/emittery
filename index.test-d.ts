import {expectType, expectError} from 'tsd';
import Emittery = require('.');

// emit
{
	const ee = new Emittery();
	ee.emit('anEvent');
	ee.emit('anEvent', 'some data');
}

// on
{
	const ee = new Emittery();
	ee.on('anEvent', () => undefined);
	ee.on('anEvent', () => Promise.resolve());
	ee.on('anEvent', data => undefined);
	ee.on('anEvent', data => Promise.resolve());
	ee.on(Emittery.listenerAdded, ({eventName, listener}) => {});
	ee.on(Emittery.listenerRemoved, ({eventName, listener}) => {});
	const off = ee.on('anEvent', () => undefined);
	off();
}

// off
{
	const ee = new Emittery();
	ee.off('anEvent', () => undefined);
	ee.off('anEvent', () => Promise.resolve());
	ee.off('anEvent', data => undefined);
	ee.off('anEvent', data => Promise.resolve());
}

{
	const ee = new Emittery();
	expectError(ee.emit('anEvent', 'some data', 'and more'));
}

{
	const ee = new Emittery();
	expectError(ee.on("anEvent", (data: any, more: any) => undefined));
}

// strict typing
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
	}>();
	ee.emit("open");
	ee.emit("close");
	ee.emit("value", "test");
	expectError(ee.emit("value"));
	expectError(ee.emit("open", "test"));
}
