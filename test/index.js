import test from 'ava';
import delay from 'delay';
import pEvent from 'p-event';
import Emittery from '../index.js';

test('on()', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('eventName');
	const calls = [];
	const listener1 = () => {
		calls.push(1);
	};

	const listener2 = () => {
		calls.push(2);
	};

	const listener3 = () => {
		calls.push(3);
	};

	emitter.on('🦄', listener1);
	emitter.on('🦄', listener2);
	emitter.on(eventName, listener3);
	await emitter.emit('🦄');
	await emitter.emit(eventName);
	t.deepEqual(calls, [1, 2, 3]);
});

test('on() - multiple event names', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('eventName');
	let count = 0;
	const listener = () => {
		++count;
	};

	emitter.on(['🦄', '🐶', eventName], listener);
	await emitter.emit('🦄');
	await emitter.emit('🐶');
	await emitter.emit(eventName);
	t.is(count, 3);
});

test('on() - symbol eventName', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('eventName');
	const calls = [];
	const listener1 = () => {
		calls.push(1);
	};

	const listener2 = () => {
		calls.push(2);
	};

	emitter.on(eventName, listener1);
	emitter.on(eventName, listener2);
	await emitter.emit(eventName);
	t.deepEqual(calls, [1, 2]);
});

test('on() - listenerAdded', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	setImmediate(() => emitter.on('abc', addListener));
	const {eventName, listener} = await pEvent(emitter, Emittery.listenerAdded, {
		rejectionEvents: []
	});
	t.is(listener, addListener);
	t.is(eventName, 'abc');
});

test('on() - listenerRemoved', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	emitter.on('abc', addListener);
	setImmediate(() => emitter.off('abc', addListener));
	const {eventName, listener} = await pEvent(emitter, Emittery.listenerRemoved, {
		rejectionEvents: []
	});
	t.is(listener, addListener);
	t.is(eventName, 'abc');
});

test('on() - listenerAdded onAny', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	setImmediate(() => emitter.onAny(addListener));
	const {eventName, listener} = await pEvent(emitter, Emittery.listenerAdded, {
		rejectionEvents: []
	});
	t.is(listener, addListener);
	t.is(eventName, undefined);
});

test('off() - listenerAdded', t => {
	const emitter = new Emittery();
	const off = emitter.on(Emittery.listenerAdded, () => t.fail());
	off();
	emitter.emit('a');
	t.pass();
});

test('off() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	const off = emitter.on('test', () => {});
	off();
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'unsubscribe');
	t.is(eventStore[2].eventName, 'test');
	t.is(eventStore[2].debugName, 'testEmitter');
});

test('on() - listenerAdded offAny', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	emitter.onAny(addListener);
	setImmediate(() => emitter.offAny(addListener));
	const {listener, eventName} = await pEvent(emitter, Emittery.listenerRemoved);
	t.is(listener, addListener);
	t.is(eventName, undefined);
});

test('on() - eventName must be a string or a symbol', t => {
	const emitter = new Emittery();

	emitter.on('string', () => {});
	emitter.on(Symbol('symbol'), () => {});

	t.throws(() => {
		emitter.on(42, () => {});
	}, TypeError);
});

test('on() - must have a listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.on('🦄');
	}, TypeError);
});

test('on() - returns a unsubcribe method', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	const off = emitter.on('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	off();
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('on() - dedupes identical listeners', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	emitter.on('🦄', listener);
	emitter.on('🦄', listener);
	emitter.on('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('on() - isDebug logs output', t => {
	const eventStore = [];
	const calls = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	emitter.on('test', data => calls.push(data));
	t.true(eventStore.length > 0);
	t.is(eventStore[0].type, 'subscribe');
	t.is(eventStore[0].debugName, 'testEmitter');
	t.is(eventStore[0].eventName, 'test');
});

test.serial('events()', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	await emitter.emit('🦄', '🌈');
	setTimeout(() => {
		emitter.emit('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(3);
	const expected = ['🌈', '🌟'];
	for await (const data of iterator) {
		t.deepEqual(data, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test.serial('events() - multiple event names', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events(['🦄', '🐶']);

	await emitter.emit('🦄', '🌈');
	await emitter.emit('🐶', '🌈');
	setTimeout(() => {
		emitter.emit('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(4);
	const expected = ['🌈', '🌈', '🌟'];
	for await (const data of iterator) {
		t.deepEqual(data, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test('events() - return() called during emit', async t => {
	const emitter = new Emittery();
	let iterator = null;
	emitter.on('🦄', () => {
		iterator.return();
	});
	iterator = emitter.events('🦄');
	emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: '🌈'});
	t.deepEqual(await iterator.next(), {done: true});
});

test('events() - return() awaits its argument', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	t.deepEqual(await iterator.return(Promise.resolve(1)), {done: true, value: 1});
});

test('events() - return() without argument', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	t.deepEqual(await iterator.return(), {done: true});
});

test('events() - discarded iterators should stop receiving events', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {value: '🌈', done: false});
	await iterator.return();
	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: true});

	setTimeout(() => {
		emitter.emit('🦄', '🌟');
	}, 10);

	await new Promise(resolve => {
		setTimeout(resolve, 20);
	});

	t.deepEqual(await iterator.next(), {done: true});
});

test('off()', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	emitter.on('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	emitter.off('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('off() - multiple event names', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	emitter.on(['🦄', '🐶', '🦊'], listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	emitter.off(['🦄', '🐶'], listener);
	await emitter.emit('🦄');
	await emitter.emit('🐶');
	t.deepEqual(calls, [1]);

	await emitter.emit('🦊');
	t.deepEqual(calls, [1, 1]);
});

test('off() - eventName must be a string or a symbol', t => {
	const emitter = new Emittery();

	emitter.on('string', () => {});
	emitter.on(Symbol('symbol'), () => {});

	t.throws(() => {
		emitter.off(42);
	}, TypeError);
});

test('off() - no listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.off('🦄');
	}, TypeError);
});

test('once()', async t => {
	const fixture = '🌈';
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	emitter.emit('🦄', fixture);
	t.is(await promise, fixture);
});

test('once() - multiple event names', async t => {
	const fixture = '🌈';
	const emitter = new Emittery();
	const promise = emitter.once(['🦄', '🐶']);
	emitter.emit('🐶', fixture);
	t.is(await promise, fixture);
});

test('once() - eventName must be a string or a symbol', async t => {
	const emitter = new Emittery();

	emitter.once('string');
	emitter.once(Symbol('symbol'));

	await t.throwsAsync(emitter.once(42), TypeError);
});

test.cb('emit() - one event', t => {
	t.plan(1);

	const emitter = new Emittery();
	const eventFixture = {foo: true};

	emitter.on('🦄', data => {
		t.deepEqual(data, eventFixture);
		t.end();
	});

	emitter.emit('🦄', eventFixture);
});

test.cb('emit() - multiple events', t => {
	t.plan(1);

	const emitter = new Emittery();
	let count = 0;

	emitter.on('🦄', async () => {
		await delay(Math.random() * 100);

		if (++count >= 5) {
			t.is(count, 5);
			t.end();
		}
	});

	emitter.emit('🦄');
	emitter.emit('🦄');
	emitter.emit('🦄');
	emitter.emit('🦄');
	emitter.emit('🦄');
});

test('emit() - eventName must be a string or a symbol', async t => {
	const emitter = new Emittery();

	emitter.emit('string');
	emitter.emit(Symbol('symbol'));

	await t.throwsAsync(emitter.emit(42), TypeError);
});

test.cb('emit() - is async', t => {
	t.plan(2);

	const emitter = new Emittery();
	let unicorn = false;

	emitter.on('🦄', () => {
		unicorn = true;
		t.pass();
		t.end();
	});

	emitter.emit('🦄');

	t.false(unicorn);
});

test('emit() - awaits async listeners', async t => {
	const emitter = new Emittery();
	let unicorn = false;

	emitter.on('🦄', async () => {
		await Promise.resolve();
		unicorn = true;
	});

	const promise = emitter.emit('🦄');
	t.false(unicorn);
	await promise;
	t.true(unicorn);
});

test('emit() - calls listeners subscribed when emit() was invoked', async t => {
	const emitter = new Emittery();
	const calls = [];
	const off1 = emitter.on('🦄', () => {
		calls.push(1);
	});
	const p = emitter.emit('🦄');
	emitter.on('🦄', () => {
		calls.push(2);
	});
	await p;
	t.deepEqual(calls, [1]);

	const off3 = emitter.on('🦄', () => {
		calls.push(3);
		off1();
		emitter.on('🦄', () => {
			calls.push(4);
		});
	});
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3]);
	off3();

	const off5 = emitter.on('🦄', () => {
		calls.push(5);
		emitter.onAny(() => {
			calls.push(6);
		});
	});
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5]);
	off5();

	let off8 = null;
	emitter.on('🦄', () => {
		calls.push(7);
		off8();
	});
	off8 = emitter.on('🦄', () => {
		calls.push(8);
	});
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6]);

	let off10 = null;
	emitter.onAny(() => {
		calls.push(9);
		off10();
	});
	off10 = emitter.onAny(() => {
		calls.push(10);
	});
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9]);

	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);

	const p2 = emitter.emit('🦄');
	emitter.clearListeners();
	await p2;
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);
});

test('emit() - isDebug logs output', async t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	emitter.on('test', () => {});
	await emitter.emit('test', 'data');
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'emit');
	t.is(eventStore[2].eventName, 'test');
	t.is(eventStore[2].debugName, 'testEmitter');
	t.is(eventStore[2].eventData, 'data');
});

test('emit() - returns undefined', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => '🌈');
	t.is(await emitter.emit('🦄'), undefined);

	emitter.on('🦄🦄', async () => '🌈');
	t.is(await emitter.emit('🦄🦄'), undefined);
});

test('emit() - throws an error if any listener throws', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => {
		throw new Error('🌈');
	});
	await t.throwsAsync(emitter.emit('🦄'), {instanceOf: Error});

	emitter.on('🦄🦄', async () => {
		throw new Error('🌈');
	});
	await t.throwsAsync(emitter.emit('🦄🦄'), {instanceOf: Error});
});

test.cb('emitSerial()', t => {
	t.plan(1);

	const emitter = new Emittery();
	const events = [];

	const listener = async data => {
		await delay(Math.random() * 100);
		events.push(data);

		if (events.length >= 5) {
			t.deepEqual(events, [1, 2, 3, 4, 5]);
			t.end();
		}
	};

	emitter.on('🦄', () => listener(1));
	emitter.on('🦄', () => listener(2));
	emitter.on('🦄', () => listener(3));
	emitter.on('🦄', () => listener(4));
	emitter.on('🦄', () => listener(5));

	emitter.emitSerial('🦄', 'e');
});

test('emitSerial() - eventName must be a string or a symbol', async t => {
	const emitter = new Emittery();

	emitter.emitSerial('string');
	emitter.emitSerial(Symbol('symbol'));

	await t.throwsAsync(emitter.emitSerial(42), TypeError);
});

test.cb('emitSerial() - is async', t => {
	t.plan(2);

	const emitter = new Emittery();
	let unicorn = false;

	emitter.on('🦄', () => {
		unicorn = true;
		t.pass();
		t.end();
	});

	emitter.emitSerial('🦄');

	t.false(unicorn);
});

test('emitSerial() - calls listeners subscribed when emitSerial() was invoked', async t => {
	const emitter = new Emittery();
	const calls = [];
	const off1 = emitter.on('🦄', () => {
		calls.push(1);
	});
	const p = emitter.emitSerial('🦄');
	emitter.on('🦄', () => {
		calls.push(2);
	});
	await p;
	t.deepEqual(calls, [1]);

	const off3 = emitter.on('🦄', () => {
		calls.push(3);
		off1();
		emitter.on('🦄', () => {
			calls.push(4);
		});
	});
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3]);
	off3();

	const off5 = emitter.on('🦄', () => {
		calls.push(5);
		emitter.onAny(() => {
			calls.push(6);
		});
	});
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5]);
	off5();

	let off8 = null;
	emitter.on('🦄', () => {
		calls.push(7);
		off8();
	});
	off8 = emitter.on('🦄', () => {
		calls.push(8);
	});
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6]);

	let off10 = null;
	emitter.onAny(() => {
		calls.push(9);
		off10();
	});
	off10 = emitter.onAny(() => {
		calls.push(10);
	});
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9]);

	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);

	const p2 = emitter.emitSerial('🦄');
	emitter.clearListeners();
	await p2;
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);
});

test('emitSerial() - isDebug logs output', async t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	emitter.on('test', () => {});
	await emitter.emitSerial('test', 'data');
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'emitSerial');
	t.is(eventStore[2].eventName, 'test');
	t.is(eventStore[2].debugName, 'testEmitter');
	t.is(eventStore[2].eventData, 'data');
});

test('onAny()', async t => {
	t.plan(4);

	const emitter = new Emittery();
	const eventFixture = {foo: true};

	emitter.onAny((eventName, data) => {
		t.is(eventName, '🦄');
		t.deepEqual(data, eventFixture);
	});

	await emitter.emit('🦄', eventFixture);
	await emitter.emitSerial('🦄', eventFixture);
});

test('onAny() - must have a listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.onAny();
	}, TypeError);
});

test.serial('anyEvent()', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	await emitter.emit('🦄', '🌈');
	setTimeout(() => {
		emitter.emit('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(3);
	const expected = [['🦄', '🌈'], ['🦄', '🌟']];
	for await (const data of iterator) {
		t.deepEqual(data, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvent() - return() called during emit', async t => {
	const emitter = new Emittery();
	let iterator = null;
	emitter.onAny(() => {
		iterator.return();
	});
	iterator = emitter.anyEvent();
	emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: ['🦄', '🌈']});
	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvents() - discarded iterators should stop receiving events', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {value: ['🦄', '🌈'], done: false});
	await iterator.return();
	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: true});

	setTimeout(() => {
		emitter.emit('🦄', '🌟');
	}, 10);

	await new Promise(resolve => {
		setTimeout(resolve, 20);
	});

	t.deepEqual(await iterator.next(), {done: true});
});

test('offAny()', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	emitter.onAny(listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
	emitter.offAny(listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('offAny() - no listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.offAny();
	}, TypeError);
});

test('clearListeners()', async t => {
	const emitter = new Emittery();
	const calls = [];
	emitter.on('🦄', () => {
		calls.push('🦄1');
	});
	emitter.on('🌈', () => {
		calls.push('🌈');
	});
	emitter.on('🦄', () => {
		calls.push('🦄2');
	});
	emitter.onAny(() => {
		calls.push('any1');
	});
	emitter.onAny(() => {
		calls.push('any2');
	});
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2']);
	emitter.clearListeners();
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2']);
});

test('clearListeners() - also clears iterators', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	const anyIterator = emitter.anyEvent();
	await emitter.emit('🦄', '🌟');
	await emitter.emit('🌈', '🌟');
	t.deepEqual(await iterator.next(), {done: false, value: '🌟'});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🦄', '🌟']});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🌈', '🌟']});
	await emitter.emit('🦄', '💫');
	emitter.clearListeners();
	await emitter.emit('🌈', '💫');
	t.deepEqual(await iterator.next(), {done: false, value: '💫'});
	t.deepEqual(await iterator.next(), {done: true});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🦄', '💫']});
	t.deepEqual(await anyIterator.next(), {done: true});
});

test('clearListeners() - with event name', async t => {
	const emitter = new Emittery();
	const calls = [];
	emitter.on('🦄', () => {
		calls.push('🦄1');
	});
	emitter.on('🌈', () => {
		calls.push('🌈');
	});
	emitter.on('🦄', () => {
		calls.push('🦄2');
	});
	emitter.onAny(() => {
		calls.push('any1');
	});
	emitter.onAny(() => {
		calls.push('any2');
	});
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2']);
	emitter.clearListeners('🦄');
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2', 'any1', 'any2', '🌈', 'any1', 'any2']);
});

test('clearListeners() - with multiple event names', async t => {
	const emitter = new Emittery();
	const calls = [];
	emitter.on('🦄', () => {
		calls.push('🦄1');
	});
	emitter.on('🌈', () => {
		calls.push('🌈');
	});
	emitter.on('🦄', () => {
		calls.push('🦄2');
	});
	emitter.onAny(() => {
		calls.push('any1');
	});
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', '🌈', 'any1']);
	emitter.clearListeners(['🦄', '🌈']);
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', '🌈', 'any1', 'any1', 'any1']);
});

test('clearListeners() - with event name - clears iterators for that event', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	const anyIterator = emitter.anyEvent();
	await emitter.emit('🦄', '🌟');
	await emitter.emit('🌈', '🌟');
	t.deepEqual(await iterator.next(), {done: false, value: '🌟'});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🦄', '🌟']});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🌈', '🌟']});
	await emitter.emit('🦄', '💫');
	emitter.clearListeners('🦄');
	await emitter.emit('🌈', '💫');
	t.deepEqual(await iterator.next(), {done: false, value: '💫'});
	t.deepEqual(await iterator.next(), {done: true});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🦄', '💫']});
	t.deepEqual(await anyIterator.next(), {done: false, value: ['🌈', '💫']});
});

test('clearListeners() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	emitter.on('test', () => {});
	emitter.clearListeners('test');
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'clear');
	t.is(eventStore[2].eventName, 'test');
	t.is(eventStore[2].debugName, 'testEmitter');
});

test('onAny() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	emitter.onAny(() => {});
	t.true(eventStore.length > 0);
	t.is(eventStore[0].type, 'subscribeAny');
	t.is(eventStore[0].eventName, undefined);
	t.is(eventStore[0].debugName, 'testEmitter');
});

test('offAny() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	const off = emitter.onAny(() => {});
	off();
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'unsubscribeAny');
	t.is(eventStore[2].eventName, undefined);
	t.is(eventStore[2].debugName, 'testEmitter');
});

test('listenerCount()', t => {
	const emitter = new Emittery();
	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	emitter.on('🦄', () => {});
	emitter.onAny(() => {});
	emitter.onAny(() => {});
	t.is(emitter.listenerCount('🦄'), 4);
	t.is(emitter.listenerCount('🌈'), 3);
	t.is(emitter.listenerCount(), 5);
});

test('listenerCount() - multiple event names', t => {
	const emitter = new Emittery();
	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	emitter.on('🦄', () => {});
	emitter.onAny(() => {});
	emitter.onAny(() => {});
	t.is(emitter.listenerCount(['🦄', '🌈']), 7);
	t.is(emitter.listenerCount(), 5);
});

test('listenerCount() - works with empty eventName strings', t => {
	const emitter = new Emittery();
	emitter.on('', () => {});
	t.is(emitter.listenerCount(''), 1);
});

test('listenerCount() - eventName must be undefined if not a string nor a symbol', t => {
	const emitter = new Emittery();

	emitter.listenerCount('string');
	emitter.listenerCount(Symbol('symbol'));
	emitter.listenerCount();

	t.throws(() => {
		emitter.listenerCount(42);
	}, TypeError);
});

test('bindMethods()', t => {
	const methodsToBind = ['on', 'off', 'emit', 'listenerCount'];

	const emitter = new Emittery();
	const target = {};

	const oldPropertyNames = Object.getOwnPropertyNames(target);
	emitter.bindMethods(target, methodsToBind);

	t.deepEqual(Object.getOwnPropertyNames(target).sort(), [...oldPropertyNames, ...methodsToBind].sort());

	for (const method of methodsToBind) {
		t.is(typeof target[method], 'function');
	}

	t.is(target.listenerCount(), 0);
});

test('bindMethods() - methodNames must be array of strings or undefined', t => {
	t.throws(() => {
		new Emittery().bindMethods({}, null);
	});

	t.throws(() => {
		new Emittery().bindMethods({}, 'string');
	});

	t.throws(() => {
		new Emittery().bindMethods({}, {});
	});

	t.throws(() => {
		new Emittery().bindMethods({}, [null]);
	});

	t.throws(() => {
		new Emittery().bindMethods({}, [1]);
	});

	t.throws(() => {
		new Emittery().bindMethods({}, [{}]);
	});
});

test('bindMethods() - must bind all methods if no array supplied', t => {
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'listenerCount', 'bindMethods', 'logIfDebugEnabled'];

	const emitter = new Emittery();
	const target = {};

	const oldPropertyNames = Object.getOwnPropertyNames(target);
	emitter.bindMethods(target);

	t.deepEqual(Object.getOwnPropertyNames(target).sort(), [...oldPropertyNames, ...methodsExpected].sort());

	for (const method of methodsExpected) {
		t.is(typeof target[method], 'function');
	}

	t.is(target.listenerCount(), 0);
});

test('bindMethods() - methodNames must only include Emittery methods', t => {
	const emitter = new Emittery();
	const target = {};
	t.throws(() => emitter.bindMethods(target, ['noexistent']));
});

test('bindMethods() - must not set already existing fields', t => {
	const emitter = new Emittery();
	const target = {
		on: true
	};
	t.throws(() => emitter.bindMethods(target, ['on']));
});

test('bindMethods() - target must be an object', t => {
	const emitter = new Emittery();
	t.throws(() => emitter.bindMethods('string', []));
	t.throws(() => emitter.bindMethods(null, []));
	t.throws(() => emitter.bindMethods(undefined, []));
});

test('mixin()', t => {
	class TestClass {
		constructor(v) {
			this.v = v;
		}
	}

	const TestClassWithMixin = Emittery.mixin('emitter', ['on', 'off', 'once', 'emit', 'emitSerial', 'onAny', 'offAny', 'clearListeners', 'listenerCount', 'bindMethods'])(TestClass);
	const symbol = Symbol('test symbol');
	const instance = new TestClassWithMixin(symbol);
	t.true(instance.emitter instanceof Emittery);
	t.true(instance instanceof TestClass);
	t.is(instance.emitter, instance.emitter);
	t.is(instance.v, symbol);
	t.is(instance.listenerCount(), 0);
});

test('mixin() - methodNames must be array of strings or undefined', t => {
	class TestClass {}

	t.throws(() => Emittery.mixin('emitter', null)(TestClass));
	t.throws(() => Emittery.mixin('emitter', 'string')(TestClass));
	t.throws(() => Emittery.mixin('emitter', {})(TestClass));
	t.throws(() => Emittery.mixin('emitter', [null])(TestClass));
	t.throws(() => Emittery.mixin('emitter', [1])(TestClass));
	t.throws(() => Emittery.mixin('emitter', [{}])(TestClass));
});

test('mixin() - must mixin all methods if no array supplied', t => {
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'listenerCount', 'bindMethods', 'logIfDebugEnabled'];

	class TestClass {}

	const TestClassWithMixin = Emittery.mixin('emitter')(TestClass);

	t.deepEqual(Object.getOwnPropertyNames(TestClassWithMixin.prototype).sort(), [...methodsExpected, 'constructor', 'emitter'].sort());
});

test('mixin() - methodNames must only include Emittery methods', t => {
	class TestClass {}

	t.throws(() => Emittery.mixin('emitter', ['nonexistent'])(TestClass));
});

test('mixin() - must not set already existing methods', t => {
	class TestClass {
		on() {
			return true;
		}
	}
	t.throws(() => Emittery.mixin('emitter', ['on'])(TestClass));
});

test('mixin() - target must be function', t => {
	t.throws(() => Emittery.mixin('emitter')('string'));
	t.throws(() => Emittery.mixin('emitter')(null));
	t.throws(() => Emittery.mixin('emitter')(undefined));
	t.throws(() => Emittery.mixin('emitter')({}));
});

test('isDebug default logger handles symbol event names and object for event data', async t => {
	const emitter = new Emittery({debug: {name: 'testEmitter', enabled: true}});
	const eventName = Symbol('test');
	emitter.on(eventName, () => {});
	await t.notThrowsAsync(emitter.emit(eventName, {complex: ['data', 'structure', 1]}));
});

test('isDebug can be turned on globally during runtime', t => {
	Emittery.isDebugEnabled = true;
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: false,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});

	emitter.on('test', () => {});
	emitter.emit('test', 'test data');
	Emittery.isDebugEnabled = false;
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'emit');
	t.is(eventStore[2].eventName, 'test');
	t.is(eventStore[2].debugName, 'testEmitter');
	t.is(eventStore[2].eventData, 'test data');
});

test('isDebug can be turned on for and instance without using the constructor', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: false,
			logger: (type, debugName, eventName, eventData) => {
				eventStore.push({type, debugName, eventName, eventData});
			}
		}
	});
	emitter.debug.enabled = true;

	emitter.on('test', () => {});
	emitter.emit('test', 'test data');
	t.true(eventStore.length > 0);
	t.is(eventStore[2].type, 'emit');
	t.is(eventStore[2].eventName, 'test');
	t.is(eventStore[2].debugName, 'testEmitter');
	t.is(eventStore[2].eventData, 'test data');
});
