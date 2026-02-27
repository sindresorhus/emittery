import test from 'ava';
import delay from 'delay';
import {pEvent, pEventMultiple} from 'p-event';
import Emittery from '../index.js';
import {eventsMap} from '../maps.js';

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
	const {data: {eventName, listener}} = await pEvent(emitter, Emittery.listenerAdded, {
		rejectionEvents: [],
	});
	t.is(listener, addListener);
	t.is(eventName, 'abc');
});

test('on() - listenerRemoved', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	emitter.on('abc', addListener);
	setImmediate(() => emitter.off('abc', addListener));
	const {data: {eventName, listener}} = await pEvent(emitter, Emittery.listenerRemoved, {
		rejectionEvents: [],
	});
	t.is(listener, addListener);
	t.is(eventName, 'abc');
});

test('on() - listenerAdded onAny', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	setImmediate(() => emitter.onAny(addListener));
	const {data: {eventName, listener}} = await pEvent(emitter, Emittery.listenerAdded, {
		rejectionEvents: [],
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
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	const off = emitter.on('test', () => {});
	off();
	t.is(eventStore.length, 2);
	t.is(eventStore[1].type, 'unsubscribe');
	t.is(eventStore[1].eventName, 'test');
	t.is(eventStore[1].debugName, 'testEmitter');
});

test('on() - listenerAdded offAny', async t => {
	const emitter = new Emittery();
	const addListener = () => 1;
	emitter.onAny(addListener);
	setImmediate(() => emitter.offAny(addListener));
	const {data: {listener, eventName}} = await pEvent(emitter, Emittery.listenerRemoved);
	t.is(listener, addListener);
	t.is(eventName, undefined);
});

test('meta event - works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.on('test', listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, 'test');
	t.is(events[0].data.listener, listener);
});

test('meta event - works when emit override clones meta event data before forwarding', async t => {
	class CustomEmittery extends Emittery {
		emit(eventName, eventData) {
			if (eventName === Emittery.listenerAdded && eventData && typeof eventData === 'object') {
				return super.emit(eventName, {...eventData});
			}

			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.on('test', listener);

	await Promise.resolve();

	t.is(events.length, 1);
	t.is(events[0].data.eventName, 'test');
	t.is(events[0].data.listener, listener);
});

test('meta event - userland meta emit is blocked during debug logger reentrancy', async t => {
	let forgedMetaEmitPromise;

	const emitter = new Emittery({
		debug: {
			enabled: true,
			logger(type) {
				if (type === 'emit' && !forgedMetaEmitPromise) {
					forgedMetaEmitPromise = emitter.emit(Emittery.listenerAdded, {eventName: 'forged', listener() {}});
				}
			},
			name: 'testEmitter',
		},
	});

	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	emitter.on('test', () => {});
	await emitter.emit('test');

	await t.throwsAsync(forgedMetaEmitPromise, {instanceOf: TypeError});
	await Promise.resolve();

	t.is(events.length, 1);
	t.is(events[0].data.eventName, 'test');
});

test('debug - on() does not log meta events', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'x',
			enabled: true,
			logger(type, _, eventName) {
				eventStore.push({type, eventName});
			},
		},
	});

	emitter.on('test', () => {});
	t.is(eventStore.length, 1);
	t.is(eventStore[0].type, 'subscribe');
	t.is(eventStore[0].eventName, 'test');
});

test('debug - off() does not log meta events', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'x',
			enabled: true,
			logger(type, _, eventName) {
				eventStore.push({type, eventName});
			},
		},
	});

	const off = emitter.on('test', () => {});
	off();
	// Subscribe + unsubscribe only; no listenerAdded/listenerRemoved meta event logs
	t.is(eventStore.length, 2);
	t.is(eventStore[0].type, 'subscribe');
	t.is(eventStore[1].type, 'unsubscribe');
});

test('debug - onAny() does not log meta events', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'x',
			enabled: true,
			logger(type, _, eventName) {
				eventStore.push({type, eventName});
			},
		},
	});

	emitter.onAny(() => {});
	t.is(eventStore.length, 1);
	t.is(eventStore[0].type, 'subscribeAny');
	t.is(eventStore[0].eventName, undefined);
});

test('debug - offAny() does not log meta events', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'x',
			enabled: true,
			logger(type, _, eventName) {
				eventStore.push({type, eventName});
			},
		},
	});

	const off = emitter.onAny(() => {});
	off();
	// SubscribeAny + unsubscribeAny only; no listenerAdded/listenerRemoved meta event logs
	t.is(eventStore.length, 2);
	t.is(eventStore[0].type, 'subscribeAny');
	t.is(eventStore[1].type, 'unsubscribeAny');
});

test.serial('meta event - internal emit does not attach catch handler', t => {
	const originalEmit = Emittery.prototype.emit;
	const emitter = new Emittery();
	let catchCalled = false;

	Emittery.prototype.emit = function (eventName, eventData) {
		if (eventName === Emittery.listenerAdded) {
			return {
				catch() {
					catchCalled = true;
				},
			};
		}

		return originalEmit.call(this, eventName, eventData);
	};

	try {
		emitter.on('test', () => {});
		t.false(catchCalled);
	} finally {
		Emittery.prototype.emit = originalEmit;
	}
});

test('meta event - userland remains blocked with async emit override present', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const listener = () => {};
	emitter.on('test', listener);

	await delay(50);

	await t.throwsAsync(emitter.emit(Emittery.listenerAdded), {instanceOf: TypeError});
	await t.throwsAsync(emitter.emit(Emittery.listenerRemoved), {instanceOf: TypeError});
});

test('meta event - userland cannot emit reserved events while internal meta emit is pending', async t => {
	const emitter = new Emittery();
	emitter.on('test', () => {});

	await t.throwsAsync(emitter.emit(Emittery.listenerAdded), {instanceOf: TypeError});
});

test('meta event - userland emit is blocked even when override delays meta event', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			if (eventName === Emittery.listenerAdded) {
				await delay(50);
			}

			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	emitter.on('test', () => {});

	await t.throwsAsync(Emittery.prototype.emit.call(emitter, Emittery.listenerAdded, {eventName: 'fake', listener() {}}), {instanceOf: TypeError});
});

test('meta event - rejected thenable override does not open meta emits', async t => {
	class CustomEmittery extends Emittery {
		emit(eventName, eventData) {
			if (eventName === Emittery.listenerAdded) {
				super.emit(eventName, eventData).catch(() => {});
				/* eslint-disable unicorn/no-thenable */
				return {
					then(_resolve, reject) {
						reject(new Error('thenable rejection'));
					},
				};
				/* eslint-enable unicorn/no-thenable */
			}

			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	t.notThrows(() => {
		emitter.on('test', () => {});
	});

	await Promise.resolve();

	await t.throwsAsync(Emittery.prototype.emit.call(emitter, Emittery.listenerRemoved, {eventName: 'fake', listener() {}}), {instanceOf: TypeError});
});

test('meta event - sync throw in emit override does not open meta emits', async t => {
	class CustomEmittery extends Emittery {
		emit(eventName, eventData) {
			if (eventName === Emittery.listenerAdded) {
				throw new Error('sync override error');
			}

			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();

	t.notThrows(() => {
		emitter.on('test', () => {});
	});

	await t.throwsAsync(emitter.emit(Emittery.listenerRemoved), {instanceOf: TypeError});
});

test('meta event - ignores non-promise finally method from emit override return value', async t => {
	class CustomEmittery extends Emittery {
		emit(eventName, eventData) {
			if (eventName === Emittery.listenerAdded) {
				return {
					finally(callback) {
						callback();
						throw new Error('throwing finally');
					},
				};
			}

			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();

	t.notThrows(() => {
		emitter.on('test', () => {});
	});

	await Promise.resolve();

	await t.throwsAsync(emitter.emit(Emittery.listenerRemoved), {instanceOf: TypeError});
});

test('meta event - listenerRemoved works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerRemoved, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.on('test', listener);
	emitter.off('test', listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, 'test');
	t.is(events[0].data.listener, listener);
});

test('meta event - concurrent on() calls with async emit override both deliver', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener1 = () => {};
	const listener2 = () => {};
	emitter.on('test', listener1);
	emitter.on('test', listener2);

	await delay(50);
	t.is(events.length, 2);

	const reportedListeners = new Set(events.map(event => event.data.listener));
	t.true(reportedListeners.has(listener1));
	t.true(reportedListeners.has(listener2));

	await t.throwsAsync(emitter.emit(Emittery.listenerAdded), {instanceOf: TypeError});
});

test('meta event - onAny() works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.onAny(listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, undefined);
	t.is(events[0].data.listener, listener);
});

test('meta event - offAny() works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerRemoved, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.onAny(listener);
	emitter.offAny(listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, undefined);
	t.is(events[0].data.listener, listener);
});

test('meta event - multiple emitters have independent counters', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter1 = new CustomEmittery();
	const emitter2 = new CustomEmittery();
	const events1 = [];
	const events2 = [];

	emitter1.on(Emittery.listenerAdded, event => {
		events1.push(event);
	});
	emitter2.on(Emittery.listenerAdded, event => {
		events2.push(event);
	});

	const listener = () => {};
	emitter1.on('test', listener);
	emitter2.on('test', listener);

	await delay(50);
	t.is(events1.length, 1);
	t.is(events2.length, 1);
	t.is(events1[0].data.listener, listener);
	t.is(events2[0].data.listener, listener);

	// Both counters settle independently - userland is blocked on both
	await t.throwsAsync(emitter1.emit(Emittery.listenerAdded), {instanceOf: TypeError});
	await t.throwsAsync(emitter2.emit(Emittery.listenerAdded), {instanceOf: TypeError});
});

test('on() - eventName must be a string, symbol, or number', t => {
	const emitter = new Emittery();

	emitter.on('string', () => {});
	emitter.on(Symbol('symbol'), () => {});
	emitter.on(42, () => {});

	t.throws(() => {
		emitter.on(true, () => {});
	}, {instanceOf: TypeError});
});

test('on() - must have a listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.on('🦄');
	}, {instanceOf: TypeError});
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
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	emitter.on('test', data => calls.push(data));
	t.is(eventStore.length, 1);
	t.is(eventStore[0].type, 'subscribe');
	t.is(eventStore[0].debugName, 'testEmitter');
	t.is(eventStore[0].eventName, 'test');
});

test('on() - listener receives event object with eventName and data', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on('🦄', event => resolve(event));
	});
	emitter.emit('🦄', '🌈');
	t.deepEqual(await promise, {name: '🦄', data: '🌈'});
});

test('on() - dataless event produces event object without data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on('🦄', event => resolve(event));
	});
	emitter.emit('🦄');
	const event = await promise;
	t.deepEqual(event, {name: '🦄'});
	t.false('data' in event);
});

test('on() - explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on('🦄', event => resolve(event));
	});
	emitter.emit('🦄', undefined);
	const event = await promise;
	t.deepEqual(event, {name: '🦄', data: undefined});
	t.true('data' in event);
});

test('on() - listeners get isolated event objects', async t => {
	const emitter = new Emittery();
	let secondListenerEvent;

	emitter.on('🦄', event => {
		event.name = 'changed';
		event.data = 'changed';
	});

	emitter.on('🦄', event => {
		secondListenerEvent = event;
	});

	await emitter.emit('🦄', '🌈');
	t.deepEqual(secondListenerEvent, {name: '🦄', data: '🌈'});
});

test('on() - symbol eventName is included in event object', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('test');
	const promise = new Promise(resolve => {
		emitter.on(eventName, event => resolve(event));
	});
	emitter.emit(eventName, 'test data');
	t.deepEqual(await promise, {name: eventName, data: 'test data'});
});

test('on() - number eventName is included in event object', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on(42, event => resolve(event));
	});
	emitter.emit(42, 'data');
	t.deepEqual(await promise, {name: 42, data: 'data'});
});

test('on() - use abort signal', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	emitter.on('abc', listener, {signal: abortController.signal});

	await emitter.emit('abc');
	t.deepEqual(calls, [1]);

	abortController.abort();
	await emitter.emit('abc');

	t.deepEqual(calls, [1]);
});

test.serial('events()', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	await emitter.emit('🦄', '🌈');
	setTimeout(() => {
		emitter.emit('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(3);
	const expected = [
		{name: '🦄', data: '🌈'},
		{name: '🦄', data: '🌟'},
	];
	for await (const event of iterator) {
		t.deepEqual(event, expected.shift());
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
	const expected = [
		{name: '🦄', data: '🌈'},
		{name: '🐶', data: '🌈'},
		{name: '🦄', data: '🌟'},
	];
	for await (const event of iterator) {
		t.deepEqual(event, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test('events() - dataless event produces event object without data key', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	await emitter.emit('🦄');
	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: '🦄'}});
	t.false('data' in result.value);
	await iterator.return();
});

test('events() - explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	await emitter.emit('🦄', undefined);
	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: '🦄', data: undefined}});
	t.true('data' in result.value);
	await iterator.return();
});

test('events() - symbol eventName is included in event object', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('test');
	const iterator = emitter.events(eventName);
	await emitter.emit(eventName, '🌈');
	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: eventName, data: '🌈'}});
	await iterator.return();
});

test('events() - iterators get isolated event objects', async t => {
	const emitter = new Emittery();
	const firstIterator = emitter.events('🦄');
	const secondIterator = emitter.events('🦄');

	await emitter.emit('🦄', '🌈');
	const first = await firstIterator.next();
	first.value.name = 'changed';
	first.value.data = 'changed';

	const second = await secondIterator.next();
	t.deepEqual(second, {done: false, value: {name: '🦄', data: '🌈'}});

	await firstIterator.return();
	await secondIterator.return();
});

test('events() - return() called during emit', async t => {
	const emitter = new Emittery();
	let iterator = null;
	emitter.on('🦄', () => {
		iterator.return();
	});
	iterator = emitter.events('🦄');
	emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});
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
	t.deepEqual(await iterator.next(), {value: {name: '🦄', data: '🌈'}, done: false});
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

test('off() - eventName must be a string, symbol, or number', t => {
	const emitter = new Emittery();

	emitter.on('string', () => {});
	emitter.on(Symbol('symbol'), () => {});
	emitter.on(42, () => {});

	t.throws(() => {
		emitter.off(true);
	}, {instanceOf: TypeError});
});

test('off() - no listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.off('🦄');
	}, {instanceOf: TypeError});
});

test('off() - clears global maps when all listeners are removed', t => {
	const emitter = new Emittery();

	const event = 'string';
	const callback = () => {};

	emitter.on(event, callback);
	t.is(eventsMap.get(emitter).get(event).size, 1);

	emitter.off(event, callback);
	t.is(eventsMap.get(emitter).get(event), undefined);
});

test('once()', async t => {
	const fixture = '🌈';
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	emitter.emit('🦄', fixture);
	t.deepEqual(await promise, {name: '🦄', data: fixture});
});

test('once() - dataless event produces event object without data key', async t => {
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	emitter.emit('🦄');
	const event = await promise;
	t.deepEqual(event, {name: '🦄'});
	t.false('data' in event);
});

test('once() - explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	emitter.emit('🦄', undefined);
	const event = await promise;
	t.deepEqual(event, {name: '🦄', data: undefined});
	t.true('data' in event);
});

test('once() - emitSerial explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	await emitter.emitSerial('🦄', undefined);
	const event = await promise;
	t.deepEqual(event, {name: '🦄', data: undefined});
	t.true('data' in event);
});

test('once() - symbol eventName is included in event object', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('test');
	const promise = emitter.once(eventName);
	emitter.emit(eventName, '🌈');
	t.deepEqual(await promise, {name: eventName, data: '🌈'});
});

test('once() - multiple event names', async t => {
	const fixture = '🌈';
	const emitter = new Emittery();
	const promise = emitter.once(['🦄', '🐶']);
	emitter.emit('🐶', fixture);
	t.deepEqual(await promise, {name: '🐶', data: fixture});
});

test('once() - eventName must be a string, symbol, or number', async t => {
	const emitter = new Emittery();

	emitter.once('string');
	emitter.once(Symbol('symbol'));
	emitter.once(42);

	await t.throwsAsync(emitter.once(true), {instanceOf: TypeError});
});

test('once() - returns a promise with an unsubscribe method', async t => {
	const fixture = '🌈';
	const emitter = new Emittery();
	const oncePromise = emitter.once('🦄');

	const testFailurePromise = Promise.race([
		(async () => {
			await oncePromise;
			t.fail();
		})(),
		new Promise(resolve => {
			setTimeout(() => {
				resolve(false);
			}, 100);
		}),
	]);

	oncePromise.off();
	emitter.emit('🦄', fixture);

	await testFailurePromise;
	t.pass();
});

test('once() - supports filter predicate', async t => {
	const emitter = new Emittery();

	const oncePromise = emitter.once('data', ({data}) => data.ok === true);
	await emitter.emit('data', {ok: false, foo: 'bar'});

	const payload = {ok: true, value: 42};

	await emitter.emit('data', payload);
	await emitter.emit('data', {ok: true, other: 'value'});

	t.deepEqual(await oncePromise, {name: 'data', data: payload});
});

test('once() - filter predicate receives full event object with eventName', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('test');
	const oncePromise = emitter.once(eventName, event => event.name === eventName && event.data === 'match');
	await emitter.emit(eventName, 'no match');
	await emitter.emit(eventName, 'match');
	t.deepEqual(await oncePromise, {name: eventName, data: 'match'});
});

test('once() - filter predicate must be a function', t => {
	const emitter = new Emittery();
	t.throws(
		() => emitter.once('data', 'not a function'),
		{
			instanceOf: TypeError,
			message: 'predicate must be a function',
		},
	);
});

test('once() - filter predicate with multiple event names', async t => {
	const emitter = new Emittery();
	const payload = {ok: true, value: 42};

	const oncePromise = emitter.once(['data1', 'data2'], ({data}) => data.ok === true);
	await emitter.emit('data1', {ok: false});
	await emitter.emit('data2', payload);

	t.deepEqual(await oncePromise, {name: 'data2', data: payload});
});

test('once() - filter predicate can be unsubscribed', async t => {
	const emitter = new Emittery();
	const oncePromise = emitter.once('data', ({data}) => data.ok === true);

	oncePromise.off();
	await emitter.emit('data', {ok: true});

	const testPromise = Promise.race([
		oncePromise,
		new Promise(resolve => {
			setTimeout(() => resolve('timeout'), 100);
		}),
	]);

	t.is(await testPromise, 'timeout');
});

test('emitSerial() - listener receives event object with eventName and data', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on('🦄', event => resolve(event));
	});
	await emitter.emitSerial('🦄', '🌈');
	t.deepEqual(await promise, {name: '🦄', data: '🌈'});
});

test('emitSerial() - explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on('🦄', event => resolve(event));
	});
	await emitter.emitSerial('🦄', undefined);
	const event = await promise;
	t.deepEqual(event, {name: '🦄', data: undefined});
	t.true('data' in event);
});

test('emitSerial() - dataless event produces event object without data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.on('🦄', event => resolve(event));
	});
	await emitter.emitSerial('🦄');
	const event = await promise;
	t.deepEqual(event, {name: '🦄'});
	t.false('data' in event);
});

test('emit() - one event', async t => {
	const emitter = new Emittery();
	const eventFixture = {foo: true};
	const promise = pEvent(emitter, '🦄');
	emitter.emit('🦄', eventFixture);
	t.deepEqual(await promise, {name: '🦄', data: eventFixture});
});

test('emit() - multiple events', async t => {
	const emitter = new Emittery();
	const expectedCount = 5;

	emitter.on('🦄', async () => {
		await delay(Math.random() * 100);
	});

	const promise = pEventMultiple(emitter, '🦄', {count: expectedCount});

	emitter.emit('🦄');
	emitter.emit('🦄');
	emitter.emit('🦄');
	emitter.emit('🦄');
	emitter.emit('🦄');

	const result = await promise;

	t.is(result.length, expectedCount);
});

test('emit() - eventName must be a string, symbol, or number', async t => {
	const emitter = new Emittery();

	emitter.emit('string');
	emitter.emit(Symbol('symbol'));
	emitter.emit(42);

	await t.throwsAsync(emitter.emit(true), {instanceOf: TypeError});
});

test('emit() - userland cannot emit the meta events', async t => {
	const emitter = new Emittery();

	await t.throwsAsync(emitter.emit(Emittery.listenerRemoved), {instanceOf: TypeError});
	await t.throwsAsync(emitter.emit(Emittery.listenerAdded), {instanceOf: TypeError});
});

test('emit() - is async', async t => {
	const emitter = new Emittery();
	const promise = pEvent(emitter, '🦄');

	let unicorn = false;
	emitter.on('🦄', () => {
		unicorn = true;
	});

	emitter.emit('🦄');

	t.false(unicorn);

	await promise;

	t.true(unicorn);
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
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	emitter.on('test', () => {});
	await emitter.emit('test', 'data');
	t.is(eventStore.length, 2);
	t.is(eventStore[1].type, 'emit');
	t.is(eventStore[1].eventName, 'test');
	t.is(eventStore[1].debugName, 'testEmitter');
	t.is(eventStore[1].eventData, 'data');
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

test('emitSerial()', async t => {
	const emitter = new Emittery();
	const promise = pEvent(emitter, '🦄');

	const values = [];
	const listener = async value => {
		await delay(Math.random() * 100);
		values.push(value);
	};

	emitter.on('🦄', () => listener(1));
	emitter.on('🦄', () => listener(2));
	emitter.on('🦄', () => listener(3));
	emitter.on('🦄', () => listener(4));
	emitter.on('🦄', () => listener(5));

	await emitter.emitSerial('🦄', 'e');
	await promise;

	t.deepEqual(values, [1, 2, 3, 4, 5]);
});

test('emitSerial() - eventName must be a string, symbol, or number', async t => {
	const emitter = new Emittery();

	emitter.emitSerial('string');
	emitter.emitSerial(Symbol('symbol'));
	emitter.emitSerial(42);

	await t.throwsAsync(emitter.emitSerial(true), {instanceOf: TypeError});
});

test('emitSerial() - userland cannot emit the meta events', async t => {
	const emitter = new Emittery();

	await t.throwsAsync(emitter.emitSerial(Emittery.listenerRemoved), {instanceOf: TypeError});
	await t.throwsAsync(emitter.emitSerial(Emittery.listenerAdded), {instanceOf: TypeError});
});

test('emitSerial() - is async', async t => {
	const emitter = new Emittery();
	const promise = pEvent(emitter, '🦄');

	let unicorn = false;
	emitter.on('🦄', () => {
		unicorn = true;
	});

	emitter.emitSerial('🦄');

	t.false(unicorn);

	await promise;

	t.true(unicorn);
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

test.serial('emitSerial() - delivers events to events() iterator', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	await emitter.emitSerial('🦄', '🌈');
	setTimeout(() => {
		emitter.emitSerial('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(3);
	const expected = [{name: '🦄', data: '🌈'}, {name: '🦄', data: '🌟'}];
	for await (const event of iterator) {
		t.deepEqual(event, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test.serial('emitSerial() - delivers explicit undefined payload to events() iterator', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	await emitter.emitSerial('🦄', undefined);

	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: '🦄', data: undefined}});
	t.true('data' in result.value);
	await iterator.return();
});

test.serial('emitSerial() - delivers events to anyEvent() iterator', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	await emitter.emitSerial('🦄', '🌈');
	setTimeout(() => {
		emitter.emitSerial('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(3);
	const expected = [{name: '🦄', data: '🌈'}, {name: '🦄', data: '🌟'}];
	for await (const event of iterator) {
		t.deepEqual(event, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test.serial('emitSerial() - delivers explicit undefined payload to anyEvent() iterator', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	await emitter.emitSerial('🦄', undefined);

	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: '🦄', data: undefined}});
	t.true('data' in result.value);
	await iterator.return();
});

test('emitSerial() - isDebug logs output', async t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	emitter.on('test', () => {});
	await emitter.emitSerial('test', 'data');
	t.is(eventStore.length, 2);
	t.is(eventStore[1].type, 'emitSerial');
	t.is(eventStore[1].eventName, 'test');
	t.is(eventStore[1].debugName, 'testEmitter');
	t.is(eventStore[1].eventData, 'data');
});

test('onAny()', async t => {
	t.plan(4);

	const emitter = new Emittery();
	const eventFixture = {foo: true};

	emitter.onAny(({name, data}) => {
		t.is(name, '🦄');
		t.deepEqual(data, eventFixture);
	});

	await emitter.emit('🦄', eventFixture);
	await emitter.emitSerial('🦄', eventFixture);
});

test('onAny() - dataless event produces event object without data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.onAny(event => resolve(event));
	});
	emitter.emit('🦄');
	const event = await promise;
	t.deepEqual(event, {name: '🦄'});
	t.false('data' in event);
});

test('onAny() - emit explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.onAny(event => resolve(event));
	});
	await emitter.emit('🦄', undefined);
	const event = await promise;
	t.deepEqual(event, {name: '🦄', data: undefined});
	t.true('data' in event);
});

test('onAny() - emitSerial explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const promise = new Promise(resolve => {
		emitter.onAny(event => resolve(event));
	});
	await emitter.emitSerial('🦄', undefined);
	const event = await promise;
	t.deepEqual(event, {name: '🦄', data: undefined});
	t.true('data' in event);
});

test('onAny() - symbol eventName is included in event object', async t => {
	const emitter = new Emittery();
	const eventName = Symbol('test');
	const promise = new Promise(resolve => {
		emitter.onAny(event => resolve(event));
	});
	emitter.emit(eventName, '🌈');
	t.deepEqual(await promise, {name: eventName, data: '🌈'});
});

test('onAny() - receives correct eventName per distinct event', async t => {
	const emitter = new Emittery();
	const events = [];
	emitter.onAny(event => events.push(event));
	await emitter.emit('🦄', '🌈');
	await emitter.emit('🐶', '🍖');
	t.deepEqual(events, [
		{name: '🦄', data: '🌈'},
		{name: '🐶', data: '🍖'},
	]);
});

test('onAny() - must have a listener', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.onAny();
	}, {instanceOf: TypeError});
});

test('onAny() - use abort signal', async t => {
	t.plan(4);

	const emitter = new Emittery();
	const eventFixture = {foo: true};
	const abortController = new AbortController();

	emitter.onAny(({name, data}) => {
		t.is(name, '🦄');
		t.deepEqual(data, eventFixture);
	}, {signal: abortController.signal});

	await emitter.emit('🦄', eventFixture);
	await emitter.emitSerial('🦄', eventFixture);
	abortController.abort();
	await emitter.emit('🦄', eventFixture);
});

test.serial('anyEvent()', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	await emitter.emit('🦄', '🌈');
	setTimeout(() => {
		emitter.emit('🦄', Promise.resolve('🌟'));
	}, 10);

	t.plan(3);
	const expected = [{name: '🦄', data: '🌈'}, {name: '🦄', data: '🌟'}];
	for await (const event of iterator) {
		t.deepEqual(event, expected.shift());
		if (expected.length === 0) {
			break;
		}
	}

	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvent() - dataless event produces event object without data key', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();
	await emitter.emit('🦄');
	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: '🦄'}});
	t.false('data' in result.value);
	await iterator.return();
});

test('anyEvent() - explicit undefined payload includes data key', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();
	await emitter.emit('🦄', undefined);
	const result = await iterator.next();
	t.deepEqual(result, {done: false, value: {name: '🦄', data: undefined}});
	t.true('data' in result.value);
	await iterator.return();
});

test('anyEvent() - iterators get isolated event objects', async t => {
	const emitter = new Emittery();
	const firstIterator = emitter.anyEvent();
	const secondIterator = emitter.anyEvent();

	await emitter.emit('🦄', '🌈');
	const first = await firstIterator.next();
	first.value.name = 'changed';
	first.value.data = 'changed';

	const second = await secondIterator.next();
	t.deepEqual(second, {done: false, value: {name: '🦄', data: '🌈'}});

	await firstIterator.return();
	await secondIterator.return();
});

test('anyEvent() - return() called during emit', async t => {
	const emitter = new Emittery();
	let iterator = null;
	emitter.onAny(() => {
		iterator.return();
	});
	iterator = emitter.anyEvent();
	emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});
	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvents() - discarded iterators should stop receiving events', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {value: {name: '🦄', data: '🌈'}, done: false});
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
	}, {instanceOf: TypeError});
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
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌟'}});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🦄', data: '🌟'}});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🌈', data: '🌟'}});
	await emitter.emit('🦄', '💫');
	emitter.clearListeners();
	await emitter.emit('🌈', '💫');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '💫'}});
	t.deepEqual(await iterator.next(), {done: true});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🦄', data: '💫'}});
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
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌟'}});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🦄', data: '🌟'}});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🌈', data: '🌟'}});
	await emitter.emit('🦄', '💫');
	emitter.clearListeners('🦄');
	await emitter.emit('🌈', '💫');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '💫'}});
	t.deepEqual(await iterator.next(), {done: true});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🦄', data: '💫'}});
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🌈', data: '💫'}});
});

test('clearListeners() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	emitter.on('test', () => {});
	emitter.clearListeners('test');
	t.is(eventStore.length, 2);
	t.is(eventStore[1].type, 'clear');
	t.is(eventStore[1].eventName, 'test');
	t.is(eventStore[1].debugName, 'testEmitter');
});

test('onAny() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	emitter.onAny(() => {});
	t.is(eventStore.length, 1);
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
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	const off = emitter.onAny(() => {});
	off();
	t.is(eventStore.length, 2);
	t.is(eventStore[1].type, 'unsubscribeAny');
	t.is(eventStore[1].eventName, undefined);
	t.is(eventStore[1].debugName, 'testEmitter');
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

test('listenerCount() - eventName must be undefined if not a string, symbol, or number', t => {
	const emitter = new Emittery();

	emitter.listenerCount('string');
	emitter.listenerCount(Symbol('symbol'));
	emitter.listenerCount(42);
	emitter.listenerCount();

	t.throws(() => {
		emitter.listenerCount(true);
	}, {instanceOf: TypeError});
});

test('listenerCount() - symbol', t => {
	const symbol = Symbol('🦄');
	const emitter = new Emittery();
	t.is(emitter.listenerCount(symbol), 0);
	emitter.on(symbol, () => {});
	emitter.on(symbol, () => {});
	t.is(emitter.listenerCount(symbol), 2);
	emitter.onAny(() => {});
	emitter.onAny(() => {});
	t.is(emitter.listenerCount(symbol), 4);
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

	t.throws(() => {
		emitter.bindMethods(target, ['noexistent']);
	});
});

test('bindMethods() - must not set already existing fields', t => {
	const emitter = new Emittery();
	const target = {
		on: true,
	};

	t.throws(() => {
		emitter.bindMethods(target, ['on']);
	});
});

test('bindMethods() - target must be an object', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.bindMethods('string', []);
	});

	t.throws(() => {
		emitter.bindMethods(null, []);
	});

	t.throws(() => {
		emitter.bindMethods(undefined, []);
	});
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

	t.throws(() => {
		Emittery.mixin('emitter', null)(TestClass);
	});

	t.throws(() => {
		Emittery.mixin('emitter', 'string')(TestClass);
	});

	t.throws(() => {
		Emittery.mixin('emitter', {})(TestClass);
	});

	t.throws(() => {
		Emittery.mixin('emitter', [null])(TestClass);
	});

	t.throws(() => {
		Emittery.mixin('emitter', [1])(TestClass);
	});

	t.throws(() => {
		Emittery.mixin('emitter', [{}])(TestClass);
	});
});

test('mixin() - must mixin all methods if no array supplied', t => {
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'listenerCount', 'bindMethods', 'logIfDebugEnabled'];

	class TestClass {}

	const TestClassWithMixin = Emittery.mixin('emitter')(TestClass);

	t.deepEqual(Object.getOwnPropertyNames(TestClassWithMixin.prototype).sort(), [...methodsExpected, 'constructor', 'emitter'].sort());
});

test('mixin() - methodNames must only include Emittery methods', t => {
	class TestClass {}

	t.throws(() => {
		Emittery.mixin('emitter', ['nonexistent'])(TestClass);
	});
});

test('mixin() - must not set already existing methods', t => {
	class TestClass {
		on() {
			return true;
		}
	}
	t.throws(() => {
		Emittery.mixin('emitter', ['on'])(TestClass);
	});
});

test('mixin() - target must be function', t => {
	t.throws(() => {
		Emittery.mixin('emitter')('string');
	});

	t.throws(() => {
		Emittery.mixin('emitter')(null);
	});

	t.throws(() => {
		Emittery.mixin('emitter')(undefined);
	});

	t.throws(() => {
		Emittery.mixin('emitter')({});
	});
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
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});

	emitter.on('test', () => {});
	emitter.emit('test', 'test data');
	Emittery.isDebugEnabled = false;
	t.true(eventStore.length > 0);
	t.is(eventStore[1].type, 'emit');
	t.is(eventStore[1].eventName, 'test');
	t.is(eventStore[1].debugName, 'testEmitter');
	t.is(eventStore[1].eventData, 'test data');
});

test('isDebug can be turned on for and instance without using the constructor', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: false,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({type, debugName, eventName, eventData});
			},
		},
	});
	emitter.debug.enabled = true;

	emitter.on('test', () => {});
	emitter.emit('test', 'test data');
	t.true(eventStore.length > 0);
	t.is(eventStore[1].type, 'emit');
	t.is(eventStore[1].eventName, 'test');
	t.is(eventStore[1].debugName, 'testEmitter');
	t.is(eventStore[1].eventData, 'test data');
});

test('debug mode - handles circular references in event data', async t => {
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
		},
	});

	const data = {};
	data.circular = data;

	await t.notThrowsAsync(emitter.emit('test', data));
});
