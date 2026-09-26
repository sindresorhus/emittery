import process from 'node:process';
import {promisify} from 'node:util';
import childProcess from 'node:child_process';
import test from 'ava';
import delay from 'delay';
import {pEvent, pEventMultiple} from 'p-event';
import Emittery from '../index.js';

const execFile = promisify(childProcess.execFile);

// Fails fast, instead of hanging the test run, when a promise never settles.
const settle = async promise => {
	let timeoutId;

	try {
		return await Promise.race([
			promise,
			new Promise((resolve, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error('Promise did not settle in time'));
				}, 1000);
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
};

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
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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
				(async () => {
					try {
						await super.emit(eventName, eventData);
					} catch {}
				})();

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

test('on() - returns an unsubscribe method', async t => {
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

test('on() - mutating the event name array afterwards does not change what off() removes', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = ({name}) => {
		calls.push(name);
	};

	const eventNames = ['🦄'];
	const off = emitter.on(eventNames, listener);
	const otherOff = emitter.on('🐶', listener);

	// The caller keeps using the array after handing it over.
	eventNames.push('🐶');

	off();

	await emitter.emit('🦄');
	await emitter.emit('🐶');

	// Only the unrelated '🐶' subscription is left.
	t.deepEqual(calls, ['🐶']);
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 1);

	otherOff();
});

test('on() - dropping an event name from the array afterwards still gets unsubscribed', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = ({name}) => {
		calls.push(name);
	};

	const eventNames = ['🦄', '🐶'];
	const off = emitter.on(eventNames, listener);
	eventNames.shift();

	off();

	await emitter.emit('🦄');
	await emitter.emit('🐶');

	t.deepEqual(calls, []);
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 0);
});

test('on() - calling off() twice is a safe no-op', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {
		calls.push(1);
	};

	const off = emitter.on('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	off();
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

test('meta event - a deduped on() only fires listenerAdded once', async t => {
	const emitter = new Emittery();
	const added = [];
	emitter.on(Emittery.listenerAdded, ({data}) => {
		added.push(data.eventName);
	});

	const listener = () => {};
	emitter.on('🦄', listener);
	emitter.on('🦄', listener);
	emitter.on('🦄', listener);
	emitter.on(['🐶', '🐶'], listener);

	await delay(20);
	t.deepEqual(added, ['🦄', '🐶']);
	t.is(emitter.listenerCount('🦄'), 1);
});

test('meta event - off() of a listener that was never subscribed does not fire listenerRemoved', async t => {
	const emitter = new Emittery();
	const removed = [];
	emitter.on(Emittery.listenerRemoved, ({data}) => {
		removed.push(data.eventName);
	});

	// One event has other listeners and one has none, which are separate paths.
	emitter.on('🦄', () => {});
	emitter.off('🦄', () => {});
	emitter.off('🐶', () => {});

	await delay(20);
	t.deepEqual(removed, []);
	t.is(emitter.listenerCount('🦄'), 1);
});

test('meta event - a repeated off() only fires listenerRemoved once', async t => {
	const emitter = new Emittery();
	const removed = [];
	emitter.on(Emittery.listenerRemoved, ({data}) => {
		removed.push(data.eventName);
	});

	const listener = () => {};
	emitter.on(['🦄', '🐶'], listener);
	await delay(20);

	emitter.off('🦄', listener);
	emitter.off('🦄', listener);
	emitter.off('🦄', listener);
	emitter.off(['🐶', '🐶'], listener);

	await delay(20);
	t.deepEqual(removed, ['🦄', '🐶']);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('meta event - a deduped onAny() only fires listenerAdded once', async t => {
	const emitter = new Emittery();
	const added = [];
	emitter.on(Emittery.listenerAdded, ({data}) => {
		added.push(data.eventName);
	});

	const listener = () => {};
	emitter.onAny(listener);
	emitter.onAny(listener);

	await delay(20);
	t.deepEqual(added, [undefined]);
});

test('meta event - offAny() of a listener that was never subscribed does not fire listenerRemoved', async t => {
	const emitter = new Emittery();
	const removed = [];
	emitter.on(Emittery.listenerRemoved, ({data}) => {
		removed.push(data.eventName);
	});

	emitter.offAny(() => {});

	await delay(20);
	t.deepEqual(removed, []);
});

test('meta event - an error from a meta listener is reported as an unhandled rejection instead of being lost', async t => {
	// AVA fails the whole run on an unhandled rejection, so this runs in a separate process.
	const code = `
		import Emittery from ${JSON.stringify(new URL('../index.js', import.meta.url).href)};

		const emitter = new Emittery();
		emitter.on(Emittery.listenerAdded, () => {
			throw new Error('meta listener failed');
		});

		emitter.on('🦄', () => {});
		console.log(emitter.listenerCount('🦄'));
	`;

	// The mode is explicit so a `NODE_OPTIONS` setting cannot change it.
	const error = await t.throwsAsync(execFile(process.execPath, ['--unhandled-rejections=throw', '--input-type=module', '--eval', code]));
	t.is(error.code, 1);
	// The subscription still happens, because the error comes after it.
	t.is(error.stdout.trim(), '1');
	t.regex(error.stderr, /AggregateError: One or more listeners threw an error/);
	t.regex(error.stderr, /meta listener failed/);
});

test('on() - isDebug logs output', t => {
	const eventStore = [];
	const calls = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
			},
		},
	});

	emitter.on('test', data => calls.push(data));
	t.is(eventStore.length, 1);
	t.is(eventStore[0].type, 'subscribe');
	t.is(eventStore[0].debugName, 'testEmitter');
	t.is(eventStore[0].eventName, 'test');
});

test('on() - a throwing debug logger leaves no listener behind', async t => {
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName) {
				if (type === 'subscribe' && eventName === 'test') {
					throw new Error('logger boom');
				}
			},
		},
	});

	const meta = [];
	emitter.on(Emittery.listenerAdded, ({data: {eventName}}) => {
		meta.push(['added', eventName]);
	});
	emitter.on(Emittery.listenerRemoved, ({data: {eventName}}) => {
		meta.push(['removed', eventName]);
	});

	const calls = [];
	t.throws(() => {
		emitter.on('test', () => {
			calls.push('listener');
		});
	}, {message: 'logger boom'});

	t.is(emitter.listenerCount('test'), 0);
	await emitter.emit('test');
	t.deepEqual(calls, []);

	// The rollback announces the removal, so the addition must have been announced too.
	t.deepEqual(meta, [['added', 'test'], ['removed', 'test']]);
});

test('onAny() - a throwing debug logger leaves no listener behind', async t => {
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type) {
				if (type === 'subscribeAny') {
					throw new Error('logger boom');
				}
			},
		},
	});

	const calls = [];
	t.throws(() => {
		emitter.onAny(() => {
			calls.push('any');
		});
	}, {message: 'logger boom'});

	t.is(emitter.listenerCount(), 0);
	await emitter.emit('test');
	t.deepEqual(calls, []);
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

test('null payload is delivered as data', async t => {
	// A `null` payload is data, not the absence of it, so the key is present.
	{
		const emitter = new Emittery();
		const promise = new Promise(resolve => {
			emitter.on('🦄', event => resolve(event));
		});
		emitter.emit('🦄', null);
		const event = await promise;
		t.deepEqual(event, {name: '🦄', data: null});
		t.true('data' in event);
	}

	{
		const emitter = new Emittery();
		const promise = new Promise(resolve => {
			emitter.onAny(event => resolve(event));
		});
		emitter.emit('🦄', null);
		t.deepEqual(await promise, {name: '🦄', data: null});
	}

	{
		const emitter = new Emittery();
		const promise = new Promise(resolve => {
			emitter.on('🦄', event => resolve(event));
		});
		emitter.emitSerial('🦄', null);
		t.deepEqual(await promise, {name: '🦄', data: null});
	}

	{
		const emitter = new Emittery();
		const promise = emitter.once('🦄');
		emitter.emit('🦄', null);
		t.deepEqual(await promise, {name: '🦄', data: null});
	}

	{
		const emitter = new Emittery();
		const iterator = emitter.events('🦄');
		emitter.emit('🦄', null);
		const event = await iterator.next();
		t.deepEqual(event.value, {name: '🦄', data: null});
		await iterator.return();
	}

	{
		const emitter = new Emittery();
		const iterator = emitter.anyEvent();
		emitter.emit('🦄', null);
		const event = await iterator.next();
		t.deepEqual(event.value, {name: '🦄', data: null});
		await iterator.return();
	}
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

test('on() - pre-aborted signal', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.on('🦄', () => {
		calls.push(1);
	}, {signal: AbortSignal.abort()});

	await emitter.emit('🦄');
	t.deepEqual(calls, []);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('on() - off() removes signal listener even if deinit throws', t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const {signal} = abortController;
	let abortListenerCount = 0;
	const addEventListener = signal.addEventListener.bind(signal);
	const removeEventListener = signal.removeEventListener.bind(signal);

	signal.addEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			++abortListenerCount;
		}

		addEventListener(eventName, listener, options);
	};

	signal.removeEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			--abortListenerCount;
		}

		removeEventListener(eventName, listener, options);
	};

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});

	const off = emitter.on('🦄', () => {}, {signal});
	t.is(abortListenerCount, 1);
	t.throws(() => {
		off();
	}, {message: 'deinit boom'});
	t.is(abortListenerCount, 0);
});

test('on() - abort signal ignores deinit throw', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});

	emitter.on('🦄', () => {}, {signal: abortController.signal});
	abortController.abort();

	await delay(0);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('on() - abort signal fully unsubscribes multiple event names when one deinit throws', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const calls = [];

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});

	emitter.init('🌈', () => () => {});

	emitter.on(['🦄', '🌈'], ({name}) => {
		calls.push(name);
	}, {signal: abortController.signal});

	abortController.abort();
	await delay(0);

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);
	await emitter.emit('🌈');
	t.deepEqual(calls, []);
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

test('events() - return() twice is a safe no-op', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	t.deepEqual(await iterator.return(), {done: true});
	t.deepEqual(await iterator.return(), {done: true});
	t.deepEqual(await iterator.next(), {done: true});
	t.is(emitter.listenerCount('🦄'), 0);
});

test('events() - return() after auto-finish is a safe no-op', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	await emitter.emit('🦄', '🌈');
	const next = await iterator.next();
	t.deepEqual(next.value, {name: '🦄', data: '🌈'});

	emitter.clearListeners('🦄');
	t.deepEqual(await iterator.next(), {done: true});
	t.deepEqual(await iterator.return(), {done: true});
	t.is(emitter.listenerCount('🦄'), 0);
});

test('anyEvent() - return() twice is a safe no-op', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();
	t.deepEqual(await iterator.return(), {done: true});
	t.deepEqual(await iterator.return(), {done: true});
	t.deepEqual(await iterator.next(), {done: true});
	t.is(emitter.listenerCount(), 0);
});

test.serial('events() - concurrent next() calls each resolve in order', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	const first = iterator.next();
	const second = iterator.next();

	await emitter.emit('🦄', '🌈');
	await emitter.emit('🦄', '🌟');

	t.deepEqual(await settle(first), {done: false, value: {name: '🦄', data: '🌈'}});
	t.deepEqual(await settle(second), {done: false, value: {name: '🦄', data: '🌟'}});

	await iterator.return();
});

test.serial('events() - concurrent next() calls are woken by return()', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	const first = iterator.next();
	const second = iterator.next();

	await iterator.return();

	t.deepEqual(await settle(first), {done: true});
	t.deepEqual(await settle(second), {done: true});
});

test.serial('events() - a meta event can be observed by subscribing to it directly', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events(Emittery.listenerAdded);
	const listener = () => {};

	emitter.on('🦄', listener);

	t.deepEqual(await settle(iterator.next()), {
		done: false,
		value: {name: Emittery.listenerAdded, data: {eventName: '🦄', listener}},
	});

	await iterator.return();
});

test.serial('anyEvent() - concurrent next() calls each resolve in order', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	const first = iterator.next();
	const second = iterator.next();

	await emitter.emit('🦄', '🌈');
	await emitter.emit('🐶', '🌟');

	t.deepEqual(await settle(first), {done: false, value: {name: '🦄', data: '🌈'}});
	t.deepEqual(await settle(second), {done: false, value: {name: '🐶', data: '🌟'}});

	await iterator.return();
});

// Collects unhandled rejections raised while running `function_` so a leaked one fails the test instead of the process.
const collectUnhandledRejections = async function_ => {
	const rejections = [];
	const listener = error => {
		rejections.push(error);
	};

	process.on('unhandledRejection', listener);

	try {
		await function_();
		// Give Node a chance to report a leaked rejection.
		await delay(20);
	} finally {
		process.off('unhandledRejection', listener);
	}

	return rejections;
};

test.serial('events() - a rejected event promise that is never read does not leak', async t => {
	const rejections = await collectUnhandledRejections(async () => {
		const emitter = new Emittery();
		const iterator = emitter.events('🦄');

		emitter.emit('🦄', '🌈');
		emitter.emit('🦄', Promise.reject(new Error('never read')));

		// Stop iterating with a rejected event still buffered.
		t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});
		await iterator.return();
	});

	t.deepEqual(rejections, []);
});

test.serial('anyEvent() - a rejected event promise that is never read does not leak', async t => {
	const rejections = await collectUnhandledRejections(async () => {
		const emitter = new Emittery();
		const iterator = emitter.anyEvent();

		emitter.emit('🦄', Promise.reject(new Error('never read')));
		await iterator.return();
	});

	t.deepEqual(rejections, []);
});

test.serial('events() - a rejected event promise ends the iterator instead of leaking it', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	const error = new Error('read');

	emitter.emit('🦄', Promise.reject(error));

	// A `for await` loop that dies does not close the iterator, so the rejection has to.
	await t.throwsAsync(async () => {
		for await (const event of iterator) {
			t.fail(`Unexpected event: ${JSON.stringify(event)}`);
		}
	}, {is: error});

	t.is(emitter.listenerCount('🦄'), 0);
	t.deepEqual(await iterator.next(), {done: true});

	// Later events are not buffered for an iterator nobody reads.
	await emitter.emit('🦄', 'ignored');
	t.deepEqual(await iterator.next(), {done: true});
	t.is(emitter.listenerCount('🦄'), 0);
});

test.serial('anyEvent() - a rejected event promise ends the iterator instead of leaking it', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();
	const error = new Error('read');

	emitter.emit('🦄', Promise.reject(error));

	await t.throwsAsync(iterator.next(), {is: error});
	t.is(emitter.listenerCount(), 0);
	t.deepEqual(await iterator.next(), {done: true});
});

test.serial('events() - a consumer that catches a rejected event can still end the iterator', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');
	const error = new Error('read');

	emitter.emit('🦄', Promise.reject(error));
	emitter.emit('🦄', 'next event');

	await t.throwsAsync(iterator.next(), {is: error});

	// The buffered event that followed the rejected one is dropped along with the subscription.
	t.deepEqual(await iterator.next(), {done: true});
	t.is(emitter.listenerCount('🦄'), 0);
});

test('events() - eventName must be a string, symbol, or number', t => {
	const emitter = new Emittery();

	t.notThrows(() => {
		emitter.events('string');
		emitter.events(Symbol('symbol'));
		emitter.events(42);
		emitter.events(['string', 42, Symbol('symbol')]);
	});

	for (const invalidEventName of [undefined, null, true, {}, () => {}, 42n]) {
		const countBefore = emitter.listenerCount();

		t.throws(() => {
			emitter.events(invalidEventName);
		}, {instanceOf: TypeError});

		t.throws(() => {
			emitter.events(['string', invalidEventName]);
		}, {instanceOf: TypeError});

		// A rejected name must not leave a half registered iterator behind.
		t.is(emitter.listenerCount(), countBefore);
	}
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

test('off() - removes listener when all listeners are removed', t => {
	const emitter = new Emittery();

	const event = 'string';
	const callback = () => {};

	emitter.on(event, callback);
	t.is(emitter.listenerCount(event), 1);

	emitter.off(event, callback);
	t.is(emitter.listenerCount(event), 0);
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

test('once() - filter predicate must be a function', async t => {
	const emitter = new Emittery();
	await t.throwsAsync(
		emitter.once('data', 'not a function'),
		{
			instanceOf: TypeError,
			message: 'predicate must be a function',
		},
	);

	// The same holds for a predicate passed through the options object.
	await t.throwsAsync(
		emitter.once('data', {predicate: 'not a function'}),
		{
			instanceOf: TypeError,
			message: 'predicate must be a function',
		},
	);
	t.is(emitter.listenerCount('data'), 0);

	await t.throwsAsync(
		emitter.once('data', {predicate: null}),
		{
			instanceOf: TypeError,
			message: 'predicate must be a function',
		},
	);
});

test('once() - a throwing predicate keeps the subscription and the promise pending', async t => {
	const emitter = new Emittery();
	const predicateError = new Error('predicate boom');
	let isSettled = false;
	let shouldThrow = true;

	const promise = emitter.once('🦄', () => {
		if (shouldThrow) {
			shouldThrow = false;
			throw predicateError;
		}

		return true;
	});
	const trackSettlement = (async () => {
		try {
			await promise;
			isSettled = true;
		} catch {}
	})();

	const error = await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
	t.is(error.errors[0], predicateError);

	// The predicate runs before the listener unsubscribes, so neither of them happened.
	await delay(10);
	t.false(isSettled);
	t.is(emitter.listenerCount('🦄'), 1);

	// The subscription is still live, so the next event still resolves the promise.
	await emitter.emit('🦄', '🌈');
	await trackSettlement;
	t.true(isSettled);
	t.deepEqual(await promise, {name: '🦄', data: '🌈'});
	t.is(emitter.listenerCount('🦄'), 0);
});

test('once() - calling off() twice is a safe no-op', t => {
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	t.is(emitter.listenerCount('🦄'), 1);

	t.notThrows(() => {
		promise.off();
		promise.off();
		promise.off();
	});

	t.is(emitter.listenerCount('🦄'), 0);
});

test('once() - calling off() after the event fired is a safe no-op', async t => {
	const emitter = new Emittery();
	const promise = emitter.once('🦄');
	await emitter.emit('🦄', '🌈');
	const event = await promise;
	t.is(event.data, '🌈');

	t.notThrows(() => {
		promise.off();
	});

	t.is(emitter.listenerCount('🦄'), 0);
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

test('once() - supports filter predicate as options object', async t => {
	const emitter = new Emittery();

	const oncePromise = emitter.once('data', {predicate: ({data}) => data.ok === true});
	await emitter.emit('data', {ok: false, foo: 'bar'});

	const payload = {ok: true, value: 42};

	await emitter.emit('data', payload);

	t.deepEqual(await oncePromise, {name: 'data', data: payload});
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

test('emit() - unawaited emits fire after synchronous code (by design)', async t => {
	const emitter = new Emittery();
	const log = [];

	emitter.on('unicorn', () => {
		log.push('listener');
	});

	const p1 = emitter.emit('unicorn');
	log.push('after emit 1');
	const p2 = emitter.emit('unicorn');
	log.push('after emit 2');

	await Promise.all([p1, p2]);

	// Listeners fire after all synchronous code because emit() yields to the microtask queue
	t.deepEqual(log, ['after emit 1', 'after emit 2', 'listener', 'listener']);
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
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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

test('emit() - throws an AggregateError if any listener throws', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => {
		throw new Error('🌈');
	});
	const error = await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
	t.is(error.errors.length, 1);
	t.is(error.errors[0].message, '🌈');

	const emitter2 = new Emittery();
	emitter2.on('🦄🦄', async () => {
		throw new Error('🌈');
	});
	const error2 = await t.throwsAsync(emitter2.emit('🦄🦄'), {instanceOf: AggregateError});
	t.is(error2.errors.length, 1);
	t.is(error2.errors[0].message, '🌈');
});

test('emit() - collects all listener errors into AggregateError', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => {
		throw new Error('first');
	});
	emitter.on('🦄', () => {
		throw new Error('second');
	});

	const error = await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
	t.is(error.errors.length, 2);
	const messages = new Set(error.errors.map(error_ => error_.message));
	t.true(messages.has('first'));
	t.true(messages.has('second'));
});

test.serial('emit() - does not require the Iterator Helpers proposal', async t => {
	// Iterator helpers are newer than the rest of the APIs this package relies on.
	const names = ['toArray', 'filter', 'map', 'flatMap', 'forEach'];
	const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(Iterator.prototype, name)]));

	// The helpers are restored in the finally block right after.
	delete Iterator.prototype.toArray;
	delete Iterator.prototype.filter;
	delete Iterator.prototype.map;
	delete Iterator.prototype.flatMap;
	delete Iterator.prototype.forEach;

	try {
		const emitter = new Emittery();
		const calls = [];

		emitter.on('🦄', () => {
			calls.push('listener');
		});

		await emitter.emit('🦄');
		t.deepEqual(calls, ['listener']);

		emitter.on('🦄', () => {
			throw new Error('boom');
		});

		const error = await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
		t.is(error.errors.length, 1);
		t.is(error.errors[0].message, 'boom');
		t.deepEqual(calls, ['listener', 'listener']);
	} finally {
		for (const [name, descriptor] of descriptors) {
			// eslint-disable-next-line no-extend-native -- Restores the helpers removed above.
			Object.defineProperty(Iterator.prototype, name, descriptor);
		}
	}
});

test('emit() - all listeners run even when one throws', async t => {
	const emitter = new Emittery();
	const executed = [];

	emitter.on('🦄', () => {
		executed.push('first');
		throw new Error('first fails');
	});
	emitter.on('🦄', () => {
		executed.push('second');
	});
	emitter.on('🦄', () => {
		executed.push('third');
	});

	await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
	t.is(executed.length, 3);
});

test('emit() - collects errors from both on() and onAny() listeners', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => {
		throw new Error('regular listener error');
	});
	emitter.onAny(() => {
		throw new Error('any listener error');
	});

	const error = await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
	t.is(error.errors.length, 2);
	const messages = new Set(error.errors.map(error_ => error_.message));
	t.true(messages.has('regular listener error'));
	t.true(messages.has('any listener error'));
});

test('emit() - collects errors from both sync and async throwing listeners', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => {
		throw new Error('sync error');
	});
	emitter.on('🦄', async () => {
		throw new Error('async error');
	});

	const error = await t.throwsAsync(emitter.emit('🦄'), {instanceOf: AggregateError});
	t.is(error.errors.length, 2);
	const messages = new Set(error.errors.map(error_ => error_.message));
	t.true(messages.has('sync error'));
	t.true(messages.has('async error'));
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

test('emitSerial() - throws listener error directly (not AggregateError)', async t => {
	const emitter = new Emittery();

	emitter.on('🦄', () => {
		throw new Error('🌈');
	});

	const error = await t.throwsAsync(emitter.emitSerial('🦄'), {instanceOf: Error});
	t.is(error.message, '🌈');
	t.false(error instanceof AggregateError);
});

test('emitSerial() - stops on first listener error', async t => {
	const emitter = new Emittery();
	const executed = [];

	emitter.on('🦄', () => {
		executed.push('first');
		throw new Error('first error');
	});
	emitter.on('🦄', () => {
		executed.push('second');
	});

	await t.throwsAsync(emitter.emitSerial('🦄'), {instanceOf: Error});
	t.deepEqual(executed, ['first']);
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
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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

test.serial('anyEvent() - does not deliver internal meta events', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	const listener = () => {};
	emitter.on('🦄', listener);
	emitter.onAny(listener);
	emitter.offAny(listener);
	emitter.off('🦄', listener);

	// The meta events are queued synchronously, so if any of them reached the iterator, it would come before the fox.
	await emitter.emit('🦊', 'fox');
	t.deepEqual(await settle(iterator.next()), {done: false, value: {name: '🦊', data: 'fox'}});

	await iterator.return();
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

test('anyEvent() - discarded iterators should stop receiving events', async t => {
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

test.serial('clearListeners() - with one event name keeps a multi-event iterator subscribed to the rest', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events(['🦄', '🦊']);

	emitter.clearListeners('🦄');

	// The cleared event no longer arrives, but the other one must keep flowing.
	await emitter.emit('🦄', 'unicorn');
	await emitter.emit('🦊', 'fox');
	t.deepEqual(await settle(iterator.next()), {done: false, value: {name: '🦊', data: 'fox'}});

	// The iterator must keep waiting for more events once the queue is drained again.
	const next = iterator.next();
	await emitter.emit('🦊', 'more fox');
	t.deepEqual(await settle(next), {done: false, value: {name: '🦊', data: 'more fox'}});

	await iterator.return();
});

test.serial('clearListeners() - with every event name of a multi-event iterator ends it', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events(['🦄', '🦊']);

	emitter.clearListeners('🦄');
	emitter.clearListeners('🦊');

	t.deepEqual(await settle(iterator.next()), {done: true});
});

test.serial('clearListeners() - ends an iterator that got the same event name twice', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events(['🦄', '🦄']);

	emitter.clearListeners('🦄');

	t.deepEqual(await settle(iterator.next()), {done: true});
});

test.serial('clearListeners() - without arguments ends a multi-event iterator', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events(['🦄', '🦊']);

	emitter.clearListeners();

	t.deepEqual(await settle(iterator.next()), {done: true});
});

test.serial('clearListeners() - with one event name keeps an anyEvent() iterator running', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	emitter.clearListeners('🦄');
	await emitter.emit('🦊', 'fox');

	t.deepEqual(await settle(iterator.next()), {done: false, value: {name: '🦊', data: 'fox'}});

	await iterator.return();
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
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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

test('clearListeners() - debug logger throw does not skip lifecycle deinit cleanup', t => {
	const loggerError = new Error('logger failed');
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type) {
				if (type === 'clear') {
					throw loggerError;
				}
			},
		},
	});
	let deinitCallCount = 0;
	emitter.init('🦄', () => () => {
		deinitCallCount++;
	});

	emitter.on('🦄', () => {});
	t.throws(() => {
		emitter.clearListeners('🦄');
	}, {is: loggerError});

	t.is(deinitCallCount, 1);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('clearListeners() - anyEvent() works after clearing all listeners', async t => {
	const emitter = new Emittery();
	emitter.clearListeners();

	const iterator = emitter.anyEvent();
	t.is(emitter.listenerCount(), 1);

	await emitter.emit('🦄', '🌟');

	const result = await Promise.race([iterator.next(), delay(50, {value: 'timeout'})]);
	t.not(result, 'timeout');
	t.deepEqual(result, {done: false, value: {name: '🦄', data: '🌟'}});
	await iterator.return();
});

test('onAny() - isDebug logs output', t => {
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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

test('offAny() - a throwing debug logger still unsubscribes the listener', async t => {
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type) {
				if (type === 'unsubscribeAny') {
					throw new Error('logger boom');
				}
			},
		},
	});

	const calls = [];
	const listener = () => {
		calls.push('any');
	};

	emitter.onAny(listener);
	t.is(emitter.listenerCount(), 1);

	let removedCount = 0;
	emitter.on(Emittery.listenerRemoved, () => {
		removedCount++;
	});

	t.throws(() => {
		emitter.offAny(listener);
	}, {message: 'logger boom'});

	// The removal must happen and be announced even though the debug logger throws.
	t.is(emitter.listenerCount('🦄'), 0);
	await emitter.emit('🦄');
	t.deepEqual(calls, []);
	t.is(removedCount, 1);
});

test('offAny() - a throwing debug logger with an abort signal still unsubscribes the listener', async t => {
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type) {
				if (type === 'unsubscribeAny') {
					throw new Error('logger boom');
				}
			},
		},
	});

	const calls = [];
	const abortController = new AbortController();
	const listener = () => {
		calls.push('any');
	};

	emitter.onAny(listener, {signal: abortController.signal});
	t.is(emitter.listenerCount(), 1);

	// The abort path swallows the error, so only the resulting state can show the leak.
	abortController.abort();
	t.is(emitter.listenerCount(), 0);
	await emitter.emit('🦄');
	t.deepEqual(calls, []);
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
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'init', 'listenerCount', 'bindMethods', 'logIfDebugEnabled'];

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

test('bindMethods() - preserves subclass overrides', async t => {
	let overrideCalled = false;

	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			overrideCalled = true;
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const target = {};
	emitter.bindMethods(target, ['emit']);

	await target.emit('test', 42);
	t.true(overrideCalled);
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

test('bindMethods() - works on a class instance', async t => {
	class Target {
		#value = 41;

		get value() {
			return this.#value;
		}
	}

	const emitter = new Emittery();
	const target = new Target();
	emitter.bindMethods(target);

	const calls = [];
	target.on('🦄', () => {
		calls.push('listener');
	});
	await target.emit('🦄', '🌈');
	t.deepEqual(calls, ['listener']);

	// The private field is untouched and the bound methods are not enumerable own properties.
	t.is(target.value, 41);
	t.deepEqual(Object.keys(target), []);
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
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'init', 'listenerCount', 'bindMethods', 'logIfDebugEnabled'];

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

test('mixin() - must not overwrite an existing emittery property', t => {
	class TestClass {
		emitter() {
			return 'original';
		}
	}

	t.throws(() => {
		Emittery.mixin('emitter')(TestClass);
	}, {message: 'The property `emitter` already exists on `target`'});
});

test('mixin() - must not overwrite an existing emittery getter', t => {
	let getterCalls = 0;
	class TestClass {
		get emitter() {
			getterCalls++;
			return undefined;
		}
	}

	t.throws(() => {
		Emittery.mixin('emitter')(TestClass);
	}, {message: 'The property `emitter` already exists on `target`'});

	// The check must not run the getter, since it would read the prototype instead of an instance.
	t.is(getterCalls, 0);
});

test('mixin() - must not shadow an inherited method', t => {
	class Base {
		on() {
			return true;
		}
	}

	class TestClass extends Base {}

	t.throws(() => {
		Emittery.mixin('emitter', ['on'])(TestClass);
	}, {message: 'The property `on` already exists on `target`'});
});

test('mixin() - applying the same mixin twice reports the collision', t => {
	class TestClass {}

	const decorate = Emittery.mixin('emitter');
	decorate(TestClass);

	t.throws(() => {
		decorate(TestClass);
	}, {message: 'The property `emitter` already exists on `target`'});
});

test('mixin() - reports a collision for a symbol emittery property', t => {
	const symbol = Symbol('emittery');

	class TestClass {}
	TestClass.prototype[symbol] = 'existing';

	t.throws(() => {
		Emittery.mixin(symbol)(TestClass);
	}, {message: 'The property `Symbol(emittery)` already exists on `target`'});
});

test('mixin() - works with a symbol emittery property', t => {
	const symbol = Symbol('emittery');

	class TestClass {}

	const Mixed = Emittery.mixin(symbol)(TestClass);
	const instance = new Mixed();
	t.true(instance[symbol] instanceof Emittery);
});

test('mixin() - the emittery property cannot also be a mixed in method', t => {
	class TestClass {}

	t.throws(() => {
		Emittery.mixin('emit', ['emit', 'on'])(TestClass);
	}, {message: '`emit` cannot be both the emittery property and a mixed in method'});

	// The class is untouched, so it can be mixed into properly afterwards.
	const Mixed = Emittery.mixin('emittery', ['emit'])(TestClass);
	t.is(typeof new Mixed().emit, 'function');
});

test('mixin() - target must be function', t => {
	t.throws(() => {
		Emittery.mixin('emitter')('string');
	}, {message: '`target` must be function'});

	t.throws(() => {
		Emittery.mixin('emitter')(null);
	}, {message: '`target` must be function'});

	t.throws(() => {
		Emittery.mixin('emitter')(undefined);
	}, {message: '`target` must be function'});

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

test('debug - two instances do not share a debug options object', async t => {
	const eventStore = [];
	const debug = {
		name: 'shared',
		logger(type) {
			eventStore.push(type);
		},
	};

	const emitter1 = new Emittery({debug});
	const emitter2 = new Emittery({debug});

	t.not(emitter1.debug, debug);
	t.not(emitter1.debug, emitter2.debug);

	emitter1.debug.enabled = true;
	t.false(emitter2.debug.enabled);

	await emitter2.emit('hello');
	t.deepEqual(eventStore, []);

	await emitter1.emit('hello');
	t.deepEqual(eventStore, ['emit']);
});

test('debug - a frozen debug options object is accepted', async t => {
	const eventStore = [];
	const logger = (type, debugName, eventName, eventData) => {
		eventStore.push({
			type,
			debugName,
			eventName,
			eventData,
		});
	};

	// Without `enabled`, the constructor has to fill in the default, which must not write to the caller's object.
	const debug = Object.freeze({
		name: 'frozen',
		logger,
	});

	const emitter = new Emittery({debug});
	t.false(emitter.debug.enabled);
	emitter.debug.enabled = true;
	await emitter.emit('hello');

	t.is(emitter.debug.name, 'frozen');
	t.is(emitter.debug.logger, logger);
	t.deepEqual(eventStore, [
		{
			type: 'emit',
			debugName: 'frozen',
			eventName: 'hello',
			eventData: undefined,
		},
	]);
});

test('debug - a frozen debug options object without a logger gets the default logger', t => {
	const debug = Object.freeze({name: 'frozen', enabled: true});
	const emitter = new Emittery({debug});

	t.is(typeof emitter.debug.logger, 'function');
	t.false(Object.hasOwn(debug, 'logger'));
});

test('debug - a debug options object keeps its prototype', t => {
	class DebugConfig {
		constructor(name) {
			this.name = name;
			this.entries = [];
		}

		logger(type, debugName) {
			this.entries.push([type, debugName]);
		}
	}

	const config = new DebugConfig('from-prototype');
	const emitter = new Emittery({debug: config});
	emitter.debug.enabled = true;
	emitter.logIfDebugEnabled('emit', '🦄');

	t.not(emitter.debug, config);
	t.is(emitter.debug.name, 'from-prototype');
	t.deepEqual(config.entries, [['emit', 'from-prototype']]);
});

test('debug - a debug options object with an inherited enabled flag keeps it without sharing it', t => {
	const debug = Object.create({name: 'proto-name', enabled: true});
	const emitter = new Emittery({debug});

	t.is(emitter.debug.name, 'proto-name');
	t.true(emitter.debug.enabled);

	emitter.debug.enabled = false;
	t.true(debug.enabled);
});

test.serial('isDebug is enabled by the DEBUG environment variable', async t => {
	const originalDebug = process.env.DEBUG;

	try {
		for (const value of ['emittery', '*']) {
			const eventStore = [];
			process.env.DEBUG = value;

			t.true(Emittery.isDebugEnabled);

			const emitter = new Emittery({
				debug: {
					name: 'testEmitter',
					logger(type, debugName, eventName) {
						eventStore.push({type, debugName, eventName});
					},
				},
			});

			emitter.on('test', () => {});
			// eslint-disable-next-line no-await-in-loop -- Each value is checked in turn.
			await emitter.emit('test');

			t.deepEqual(eventStore, [
				{type: 'subscribe', debugName: 'testEmitter', eventName: 'test'},
				{type: 'emit', debugName: 'testEmitter', eventName: 'test'},
			]);
		}

		// Any other value leaves debug off.
		process.env.DEBUG = 'something-else';
		t.false(Emittery.isDebugEnabled);
	} finally {
		if (originalDebug === undefined) {
			delete process.env.DEBUG;
		} else {
			process.env.DEBUG = originalDebug;
		}
	}
});

test('isDebug falls back to the global flag when process.env is not an object', t => {
	const originalProcess = process;

	try {
		// A browser can have a `process` global that is not Node's, or none at all.
		Object.defineProperty(globalThis, 'process', {value: {}, configurable: true, writable: true});

		Emittery.isDebugEnabled = true;
		t.true(Emittery.isDebugEnabled);

		Emittery.isDebugEnabled = false;
		t.false(Emittery.isDebugEnabled);
	} finally {
		Object.defineProperty(globalThis, 'process', {value: originalProcess, configurable: true, writable: true});
		Emittery.isDebugEnabled = false;
	}
});

test('isDebug can be turned on globally during runtime', t => {
	Emittery.isDebugEnabled = true;
	const eventStore = [];

	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: false,
			logger(type, debugName, eventName, eventData) {
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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
				eventStore.push({
					type,
					debugName,
					eventName,
					eventData,
				});
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

test('subclass emit override is called on instances', async t => {
	let overrideCalled = false;

	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			overrideCalled = true;
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	let received;
	emitter.on('test', event => {
		received = event;
	});
	await emitter.emit('test', 42);
	t.true(overrideCalled);
	t.deepEqual(received, {name: 'test', data: 42});
});

test('works through a Proxy wrapper', async t => {
	const emitter = new Emittery();
	// Simulate Vue's reactive()/ref() and Alpine.js: they intercept `get` and
	// return methods with `this` bound to the proxy, not the original instance.
	const proxy = new Proxy(emitter, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			return typeof value === 'function' ? value.bind(receiver) : value;
		},
	});
	const calls = [];

	const off = proxy.on('🦄', () => {
		calls.push('on');
	});
	proxy.onAny(() => {
		calls.push('onAny');
	});
	await proxy.emit('🦄');
	t.deepEqual(calls, ['on', 'onAny']);

	// Unsubscribe via the returned off() function and verify listener is removed
	off();
	await proxy.emit('🦄');
	t.deepEqual(calls, ['on', 'onAny', 'onAny']);

	// Verify once() resolves and auto-unsubscribes through the proxy
	const unicornPromise = proxy.once('🦄');
	await proxy.emit('🦄');
	t.deepEqual(await unicornPromise, {name: '🦄'});
	// Once() listener was removed; only the onAny listener from above remains
	t.is(proxy.listenerCount('🦄'), 1);

	// Verify clearListeners() works through the proxy
	proxy.onAny(() => {});
	proxy.clearListeners();
	t.is(proxy.listenerCount(), 0);
});

test('init() - calls init on first on(), deinit on last off()', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	t.deepEqual(calls, []);

	const off1 = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	const off2 = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']); // No second init

	off1();
	t.deepEqual(calls, ['init']); // No deinit yet

	off2();
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - no deinit if initFn returns void', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
	});

	const off = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);
	off();
	t.deepEqual(calls, ['init']); // No deinit
});

test('init() - called immediately if listeners already exist', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.on('🦄', () => {});

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	t.deepEqual(calls, ['init']);
});

test('init() - returns unsubscribe; calling it invokes deinit and removes hooks', t => {
	const emitter = new Emittery();
	const calls = [];

	const removeInit = emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	removeInit(); // Should call deinit and remove the hooks
	t.deepEqual(calls, ['init', 'deinit']);

	// Adding a new listener after removeInit() should NOT call init again
	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - clearListeners() triggers deinit', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	emitter.clearListeners('🦄');
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - clearListeners() with no arg triggers deinit for all events', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init:unicorn');
		return () => {
			calls.push('deinit:unicorn');
		};
	});

	emitter.init('🌈', () => {
		calls.push('init:rainbow');
		return () => {
			calls.push('deinit:rainbow');
		};
	});

	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow']);

	emitter.clearListeners();
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow', 'deinit:unicorn', 'deinit:rainbow']);
});

test('init() - throws if registered twice for same event', t => {
	const emitter = new Emittery();

	emitter.init('🦄', () => {});

	t.throws(() => {
		emitter.init('🦄', () => {});
	}, {instanceOf: Error});
});

test('init() - throws for meta event names', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.init(Emittery.listenerAdded, () => {});
	}, {instanceOf: TypeError});

	t.throws(() => {
		emitter.init(Emittery.listenerRemoved, () => {});
	}, {instanceOf: TypeError});
});

test('init() - throws if initFn is not a function', t => {
	const emitter = new Emittery();

	t.throws(() => {
		emitter.init('🦄', 'notAFunction');
	}, {instanceOf: TypeError});
});

test('init() - duplicate listener does not trigger init again', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const listener = () => {};
	emitter.on('🦄', listener);
	t.deepEqual(calls, ['init']);

	// Adding the same listener again is a no-op; init must not fire again
	emitter.on('🦄', listener);
	t.deepEqual(calls, ['init']);
});

test('init() - once().off() (manual cancel) triggers deinit', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const promise = emitter.once('🦄');
	t.deepEqual(calls, ['init']);

	// Cancel before the event fires — deinit must run since no listeners remain
	promise.off();
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - works with once() (deinit fires when once-listener auto-removes)', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const promise = emitter.once('🦄');
	t.deepEqual(calls, ['init']);

	await emitter.emit('🦄', '🌈');
	await promise;
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - clearListeners() then on() triggers init again', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const off = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	emitter.clearListeners('🦄');
	t.deepEqual(calls, ['init', 'deinit']);

	// The lifecycle hook is still registered — a new listener should trigger init again
	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init', 'deinit', 'init']);

	off(); // Off() for an already-cleared listener is a no-op (set doesn't have it)
	t.deepEqual(calls, ['init', 'deinit', 'init']); // Deinit not called again
});

test('init() - can be re-registered after unsubscribing the hook', t => {
	const emitter = new Emittery();
	const calls = [];

	const removeInit = emitter.init('🦄', () => {
		calls.push('init1');
	});

	const off = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init1']);

	removeInit(); // Hook removed; init1 had no deinit

	// Re-register for the same event; fires immediately since a listener is still active
	emitter.init('🦄', () => {
		calls.push('init2');
		return () => {
			calls.push('deinit2');
		};
	});
	t.deepEqual(calls, ['init1', 'init2']);

	off(); // Last listener removed → deinit2 fires
	t.deepEqual(calls, ['init1', 'init2', 'deinit2']);
});

test('init() - works with on() using array of event names', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init:unicorn');
		return () => {
			calls.push('deinit:unicorn');
		};
	});

	emitter.init('🌈', () => {
		calls.push('init:rainbow');
		return () => {
			calls.push('deinit:rainbow');
		};
	});

	// Single listener subscribed to both events
	const off = emitter.on(['🦄', '🌈'], () => {});
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow']);

	off();
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow', 'deinit:unicorn', 'deinit:rainbow']);
});

test('init() - abort signal triggers deinit when signal aborts', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const abortController = new AbortController();
	emitter.on('🦄', () => {}, {signal: abortController.signal});
	t.deepEqual(calls, ['init']);

	abortController.abort();
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - events() iterator does not trigger lifecycle', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	// Events() registers a producer, not a listener — lifecycle must not fire
	const iterator = emitter.events('🦄');
	t.deepEqual(calls, []);

	await iterator.return();
	t.deepEqual(calls, []); // Deinit also never fires
});

test('init() - initFn throwing during on() rolls back the listener', t => {
	const emitter = new Emittery();
	const error = new Error('init failed');
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		throw error;
	});

	t.throws(() => {
		emitter.on('🦄', () => {});
	}, {is: error});

	t.deepEqual(calls, ['init']);
	t.is(emitter.listenerCount('🦄'), 0); // Listener rolled back
});

test('init() - initFn throwing during on() with event name array rolls back earlier subscriptions', t => {
	const emitter = new Emittery();
	const error = new Error('init failed');
	const calls = [];
	const listener = () => {};

	emitter.init('🦄', () => {
		calls.push('init:unicorn');
		return () => {
			calls.push('deinit:unicorn');
		};
	});

	emitter.init('🌈', () => {
		calls.push('init:rainbow');
		throw error;
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈'], listener);
	}, {is: error});

	t.deepEqual(calls, ['init:unicorn', 'init:rainbow', 'deinit:unicorn']);
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);
});

test('init() - failed on() with event name array keeps pre-existing listener subscriptions', t => {
	const emitter = new Emittery();
	const error = new Error('init failed');
	const listener = () => {};

	emitter.on('🦄', listener);
	emitter.init('🌈', () => {
		throw error;
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈'], listener);
	}, {is: error});

	t.is(emitter.listenerCount('🦄'), 1);
	t.is(emitter.listenerCount('🌈'), 0);
});

test('init() - rollback keeps running and throws original error when deinit throws', t => {
	const emitter = new Emittery();
	const initError = new Error('init failed');
	const deinitError = new Error('deinit failed');
	const listener = () => {};

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.init('🌈', () => () => {});

	emitter.init('🦊', () => {
		throw initError;
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈', '🦊'], listener);
	}, {is: initError});

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);
});

test('init() - rollback removes same-listener re-subscription triggered by deinit', t => {
	const emitter = new Emittery();
	const initError = new Error('init failed');
	const listener = () => {};

	emitter.init('🦄', () => () => {
		emitter.on('🦄', listener);
	});

	emitter.init('🌈', () => {
		throw initError;
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈'], listener);
	}, {is: initError});

	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - rollback does not emit listenerRemoved for already-removed event entry', async t => {
	const emitter = new Emittery();
	const initError = new Error('init failed');
	const listener = () => {};
	const removedEventNames = [];

	emitter.on(Emittery.listenerRemoved, ({data}) => {
		if (data.eventName) {
			removedEventNames.push(data.eventName);
		}
	});

	emitter.init('🦄', () => () => {
		emitter.off('🌈', listener);
	});

	emitter.init('🌈', () => () => {});

	emitter.init('🦊', () => {
		throw initError;
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈', '🦊'], listener);
	}, {is: initError});

	await Promise.resolve();
	t.deepEqual(removedEventNames, ['🌈', '🦄']);
});

test('init() - rollback still emits listenerRemoved when debug logger throws', async t => {
	const initError = new Error('init failed');
	const listener = () => {};
	const removedEventNames = [];
	const emitter = new Emittery({
		debug: {
			enabled: true,
			logger(type) {
				if (type === 'unsubscribe') {
					throw new Error('debug failed');
				}
			},
		},
	});

	emitter.on(Emittery.listenerRemoved, ({data}) => {
		if (data.eventName) {
			removedEventNames.push(data.eventName);
		}
	});

	emitter.init('🦄', () => () => {});
	emitter.init('🌈', () => {
		throw initError;
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈'], listener);
	}, {is: initError});

	await Promise.resolve();
	t.deepEqual(removedEventNames, ['🦄']);
});

test('init() - initFn returning a non-function is silently ignored', t => {
	const emitter = new Emittery();

	emitter.init('🦄', () => 42); // Returns a number, not a function or void

	const off = emitter.on('🦄', () => {});
	t.notThrows(() => off()); // Must not throw — no deinitFn stored
	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - immediate init throw does not keep a broken registration', t => {
	const emitter = new Emittery();
	const error = new Error('init failed');

	emitter.on('🦄', () => {});

	t.throws(() => {
		emitter.init('🦄', () => {
			throw error;
		});
	}, {is: error});

	t.notThrows(() => {
		emitter.init('🦄', () => {});
	});
});

test('init() - clearListeners(eventName) runs deinit after listeners are removed', t => {
	const emitter = new Emittery();
	const listenerCountsSeenInDeinit = [];

	emitter.init('🦄', () => () => {
		listenerCountsSeenInDeinit.push(emitter.listenerCount('🦄'));
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners('🦄');

	t.deepEqual(listenerCountsSeenInDeinit, [0]);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - clearListeners(eventName) stays cleared if deinit re-subscribes', t => {
	const emitter = new Emittery();
	let deinitCallCount = 0;

	emitter.init('🦄', () => () => {
		deinitCallCount++;
		emitter.on('🦄', () => {});
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners('🦄');

	t.is(deinitCallCount, 1);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - clearListeners() runs deinit after listeners are removed for each event', t => {
	const emitter = new Emittery();
	const listenerCountsSeenInDeinit = [];

	emitter.init('🦄', () => () => {
		listenerCountsSeenInDeinit.push(['🦄', emitter.listenerCount('🦄')]);
	});

	emitter.init('🌈', () => () => {
		listenerCountsSeenInDeinit.push(['🌈', emitter.listenerCount('🌈')]);
	});

	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	emitter.clearListeners();

	t.deepEqual(listenerCountsSeenInDeinit, [['🦄', 0], ['🌈', 0]]);
});

test('init() - clearListeners() stays cleared if deinit re-subscribes onAny()', t => {
	const emitter = new Emittery();

	emitter.init('🦄', () => () => {
		emitter.onAny(() => {});
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners();

	t.is(emitter.listenerCount(), 0);
});

test('init() - clearListeners() stays cleared if deinit re-subscribes to a different event', t => {
	const emitter = new Emittery();

	emitter.init('🦄', () => () => {
		emitter.on('🌈', () => {});
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners();

	t.is(emitter.listenerCount(), 0);
});

test('init() - clearListeners(eventName) does not re-enter deinit via removeInit()', t => {
	const emitter = new Emittery();
	let deinitCallCount = 0;
	const removeInit = emitter.init('🦄', () => () => {
		deinitCallCount++;
		if (deinitCallCount === 1) {
			removeInit();
		}
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners('🦄');

	t.is(deinitCallCount, 1);
});

test('init() - removeInit() does not re-enter deinit cleanup', t => {
	const emitter = new Emittery();
	let deinitCallCount = 0;
	const listener = () => {};

	const removeInit = emitter.init('🦄', () => () => {
		deinitCallCount++;
		if (deinitCallCount === 1) {
			emitter.off('🦄', listener);
		}
	});

	emitter.on('🦄', listener);
	removeInit();

	t.is(deinitCallCount, 1);
});

test('init() - clearListeners(eventName) does not leak deinit emissions to events() iterators', async t => {
	const emitter = new Emittery();
	emitter.init('🦄', () => () => {
		emitter.emit('🦄', 'from-deinit');
	});

	const iterator = emitter.events('🦄');
	emitter.on('🦄', () => {});
	emitter.clearListeners('🦄');

	t.deepEqual(await iterator.next(), {done: true});
});

test('init() - clearListeners() does not leak deinit emissions to anyEvent() iterators', async t => {
	const emitter = new Emittery();
	emitter.init('🦄', () => () => {
		emitter.emit('🦄', 'from-deinit');
	});

	emitter.on('🦄', () => {});
	const anyIterator = emitter.anyEvent();
	emitter.clearListeners();

	t.deepEqual(await anyIterator.next(), {done: true});
});

test('init() - clearListeners(eventName) blocks deinit emissions for iterators created in deinit', async t => {
	const emitter = new Emittery();
	let iteratorCreatedInDeinit;
	emitter.init('🦄', () => () => {
		iteratorCreatedInDeinit = emitter.events('🦄');
		emitter.emit('🦄', 'from-deinit');
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners('🦄');

	t.truthy(iteratorCreatedInDeinit);
	t.deepEqual(await iteratorCreatedInDeinit.next(), {done: true});
});

test('init() - clearListeners() blocks deinit emissions for anyEvent() iterators created in deinit', async t => {
	const emitter = new Emittery();
	let iteratorCreatedInDeinit;
	emitter.init('🦄', () => () => {
		iteratorCreatedInDeinit = emitter.anyEvent();
		emitter.emit('🦄', 'from-deinit');
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners();

	t.truthy(iteratorCreatedInDeinit);
	t.deepEqual(await iteratorCreatedInDeinit.next(), {done: true});
});

test('init() - removeInit() unregisters lifecycle even if deinit throws', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	let initCallCount = 0;

	const removeInit = emitter.init('🦄', () => {
		initCallCount++;
		return () => {
			throw deinitError;
		};
	});

	const off = emitter.on('🦄', () => {});
	t.is(initCallCount, 1);

	t.throws(() => {
		removeInit();
	}, {is: deinitError});

	off();
	emitter.on('🦄', () => {});
	t.is(initCallCount, 1);
});

test('init() - clearListeners(eventName) suppression does not block other events', async t => {
	const emitter = new Emittery();
	emitter.init('🦄', () => () => {
		emitter.emit('🌈', 'from-deinit');
	});

	emitter.on('🦄', () => {});
	const anyIterator = emitter.anyEvent();
	emitter.clearListeners('🦄');

	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🌈', data: 'from-deinit'}});
	await anyIterator.return();
});

test('init() - clearListeners(eventName) restores enqueue behavior when deinit throws', async t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.on('🦄', () => {});
	t.throws(() => {
		emitter.clearListeners('🦄');
	}, {is: deinitError});

	const iterator = emitter.events('🦄');
	await emitter.emit('🦄', 'after-throw');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: 'after-throw'}});
	await iterator.return();
});

test('init() - clearListeners() restores enqueue behavior when deinit throws', async t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.on('🦄', () => {});
	t.throws(() => {
		emitter.clearListeners();
	}, {is: deinitError});

	const anyIterator = emitter.anyEvent();
	const rainbowIterator = emitter.events('🌈');
	await emitter.emit('🌈', 'after-throw');
	t.deepEqual(await anyIterator.next(), {done: false, value: {name: '🌈', data: 'after-throw'}});
	t.deepEqual(await rainbowIterator.next(), {done: false, value: {name: '🌈', data: 'after-throw'}});
	await anyIterator.return();
	await rainbowIterator.return();
});

test('init() - clearListeners(eventName) rethrows falsy deinit throw values', t => {
	const emitter = new Emittery();
	const throwValue = value => {
		throw value;
	};

	emitter.init('🦄', () => () => {
		throwValue(0);
	});

	emitter.on('🦄', () => {});
	let thrownError = Symbol('not-thrown');
	try {
		emitter.clearListeners('🦄');
	} catch (error) {
		thrownError = error;
	}

	t.is(thrownError, 0);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - clearListeners(eventName) rethrows undefined deinit throw values', t => {
	const emitter = new Emittery();
	const throwValue = value => {
		throw value;
	};

	emitter.init('🦄', () => () => {
		throwValue(undefined);
	});

	emitter.on('🦄', () => {});
	let thrownError = Symbol('not-thrown');
	try {
		emitter.clearListeners('🦄');
	} catch (error) {
		thrownError = error;
	}

	t.is(thrownError, undefined);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - clearListeners(eventName) stays authoritative when deinit re-subscribes and throws', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	emitter.init('🦄', () => () => {
		emitter.on('🦄', () => {});
		throw deinitError;
	});

	emitter.on('🦄', () => {});
	t.throws(() => {
		emitter.clearListeners('🦄');
	}, {is: deinitError});

	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - clearListeners() stays authoritative when deinit re-subscribes and throws', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	emitter.init('🦄', () => () => {
		emitter.on('🦄', () => {});
		throw deinitError;
	});

	emitter.on('🦄', () => {});
	t.throws(() => {
		emitter.clearListeners();
	}, {is: deinitError});

	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - clearListeners() stays authoritative when later deinit re-subscribes earlier event and throws', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	emitter.init('🦄', () => () => {});
	emitter.init('🌈', () => () => {
		emitter.on('🦄', () => {});
		throw deinitError;
	});

	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	t.throws(() => {
		emitter.clearListeners();
	}, {is: deinitError});

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);
	t.is(emitter.listenerCount(), 0);
});

test('init() - clearListeners() continues deinit for later events when earlier deinit throws', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	let rainbowInitCallCount = 0;
	let rainbowDeinitCallCount = 0;

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.init('🌈', () => {
		rainbowInitCallCount++;
		if (rainbowInitCallCount === 1) {
			return () => {
				rainbowDeinitCallCount++;
			};
		}
	});

	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	t.throws(() => {
		emitter.clearListeners();
	}, {is: deinitError});
	t.is(rainbowDeinitCallCount, 1);

	const offRainbow = emitter.on('🌈', () => {});
	offRainbow();

	t.is(rainbowInitCallCount, 2);
	t.is(rainbowDeinitCallCount, 1);
});

test('init() - clearListeners([...]) continues deinit for later events when earlier deinit throws', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');
	let rainbowInitCallCount = 0;
	let rainbowDeinitCallCount = 0;

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.init('🌈', () => {
		rainbowInitCallCount++;
		if (rainbowInitCallCount === 1) {
			return () => {
				rainbowDeinitCallCount++;
			};
		}
	});

	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	t.throws(() => {
		emitter.clearListeners(['🦄', '🌈']);
	}, {is: deinitError});
	t.is(rainbowDeinitCallCount, 1);

	const offRainbow = emitter.on('🌈', () => {});
	offRainbow();

	t.is(rainbowInitCallCount, 2);
	t.is(rainbowDeinitCallCount, 1);
});

test('init() - clearListeners([...]) suppresses deinit emissions for each cleared event', async t => {
	const emitter = new Emittery();
	let unicornDeinitCount = 0;
	let rainbowDeinitCount = 0;
	emitter.init('🦄', () => () => {
		unicornDeinitCount++;
		emitter.emit('🦄', 'from-deinit');
	});
	emitter.init('🌈', () => () => {
		rainbowDeinitCount++;
		emitter.emit('🌈', 'from-deinit');
	});

	const unicornIterator = emitter.events('🦄');
	const rainbowIterator = emitter.events('🌈');
	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	emitter.clearListeners(['🦄', '🌈']);

	t.is(unicornDeinitCount, 1);
	t.is(rainbowDeinitCount, 1);
	t.deepEqual(await unicornIterator.next(), {done: true});
	t.deepEqual(await rainbowIterator.next(), {done: true});
});

test('init() - clearListeners(eventName) does not leave reinitialized lifecycle active', t => {
	const emitter = new Emittery();
	let activeLifecycleCount = 0;

	emitter.init('🦄', () => {
		activeLifecycleCount++;
		return () => {
			activeLifecycleCount--;
			emitter.on('🦄', () => {});
		};
	});

	emitter.on('🦄', () => {});
	emitter.clearListeners('🦄');

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(activeLifecycleCount, 0);
});

test('init() - clearListeners([...]) suppresses cross-event deinit emissions', async t => {
	const emitter = new Emittery();
	emitter.init('🦄', () => () => {
		emitter.emit('🌈', 'cross-event');
	});

	const rainbowIterator = emitter.events('🌈');
	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	emitter.clearListeners(['🦄', '🌈']);

	t.deepEqual(await rainbowIterator.next(), {done: true});
});

test('init() - clearListeners([...]) stays authoritative when later deinit re-subscribes earlier event', t => {
	const emitter = new Emittery();
	emitter.init('🦄', () => () => {});
	emitter.init('🌈', () => () => {
		emitter.on('🦄', () => {});
	});

	emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	emitter.clearListeners(['🦄', '🌈']);

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);
});

test('clearListeners(eventName) - removes listener', t => {
	const emitter = new Emittery();
	emitter.on('🦄', () => {});
	t.is(emitter.listenerCount('🦄'), 1);

	emitter.clearListeners('🦄');
	t.is(emitter.listenerCount('🦄'), 0);
});

test('clearListeners() - handles large event name arrays without stack overflow', t => {
	const emitter = new Emittery();
	const eventNames = Array.from({length: 5000}, (_, index) => `event-${index}`);

	t.notThrows(() => {
		emitter.clearListeners(eventNames);
	});
});

test('clearListeners() - eventName must be undefined if not a string, symbol, or number', t => {
	const emitter = new Emittery();

	t.notThrows(() => {
		emitter.clearListeners('string');
		emitter.clearListeners(Symbol('symbol'));
		emitter.clearListeners(42);
		emitter.clearListeners();
		emitter.clearListeners(undefined);
		emitter.clearListeners(['string', 42, Symbol('symbol')]);
	});

	for (const invalidEventName of [null, true, {}, () => {}, 42n]) {
		emitter.on('🦄', () => {});
		const count = emitter.listenerCount('🦄');

		t.throws(() => {
			emitter.clearListeners(invalidEventName);
		}, {instanceOf: TypeError});

		t.throws(() => {
			emitter.clearListeners(['string', invalidEventName]);
		}, {instanceOf: TypeError});

		// An invalid event name must not clear anything.
		t.is(emitter.listenerCount('🦄'), count);
	}
});

test('init() - removeInit() called twice is safe', t => {
	const emitter = new Emittery();
	let deinitCallCount = 0;

	const removeInit = emitter.init('🦄', () => () => {
		deinitCallCount++;
	});

	emitter.on('🦄', () => {});
	removeInit();
	t.is(deinitCallCount, 1);

	// Second call is a no-op
	removeInit();
	t.is(deinitCallCount, 1);
});

test('init() - removeInit() called twice after re-registration does not delete new lifecycle', t => {
	const emitter = new Emittery();
	const calls = [];

	const removeInit1 = emitter.init('🦄', () => {
		calls.push('init1');
		return () => {
			calls.push('deinit1');
		};
	});

	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init1']);

	removeInit1();
	t.deepEqual(calls, ['init1', 'deinit1']);

	// Re-register a new lifecycle for the same event
	emitter.init('🦄', () => {
		calls.push('init2');
		return () => {
			calls.push('deinit2');
		};
	});

	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init1', 'deinit1', 'init2']);

	// Calling the OLD removeInit again must NOT delete the new lifecycle
	removeInit1();
	t.deepEqual(calls, ['init1', 'deinit1', 'init2']); // No deinit2

	// Prove the new lifecycle is still active by clearing all listeners
	emitter.clearListeners('🦄');
	t.deepEqual(calls, ['init1', 'deinit1', 'init2', 'deinit2']);
});

test('init() - deinitFn throwing during off() still removes the listener', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit failed');

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	const listener = () => {};
	emitter.on('🦄', listener);
	t.is(emitter.listenerCount('🦄'), 1);

	t.throws(() => {
		emitter.off('🦄', listener);
	}, {is: deinitError});

	// Listener was removed despite the throw
	t.is(emitter.listenerCount('🦄'), 0);
});

test('init() - a deinit that re-subscribes the same listener wins over off()', t => {
	// `clearListeners()` and the `on()` rollback are authoritative over a re-subscribing deinit, but `off()` is not: the deinit re-subscribes after the removal, so the listener simply stays.
	const emitter = new Emittery();
	const listener = () => {};

	emitter.init('🦄', () => () => {
		emitter.on('🦄', listener);
	});

	emitter.on('🦄', listener);
	emitter.off('🦄', listener);
	t.is(emitter.listenerCount('🦄'), 1);
});

test('off() - a throwing deinit still unsubscribes the remaining event names', async t => {
	const emitter = new Emittery();
	const calls = [];
	emitter.init('🦄', () => () => {
		calls.push('deinit:🦄');
		throw new Error('deinit boom');
	});
	emitter.init('🐶', () => () => {
		calls.push('deinit:🐶');
	});

	const listener = () => {
		calls.push('event');
	};

	emitter.on(['🦄', '🐶'], listener);

	t.throws(() => {
		emitter.off(['🦄', '🐶'], listener);
	}, {message: 'deinit boom'});

	// Every event name is unsubscribed and every deinit runs.
	t.deepEqual(calls, ['deinit:🦄', 'deinit:🐶']);
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 0);

	await emitter.emit('🦄');
	await emitter.emit('🐶');
	t.deepEqual(calls, ['deinit:🦄', 'deinit:🐶']);
});

const rethrowsFirstDeinitError = test.macro((t, unsubscribe) => {
	const emitter = new Emittery();
	const firstError = new Error('first');
	const secondError = new Error('second');

	emitter.init('🦄', () => () => {
		throw firstError;
	});
	emitter.init('🐶', () => () => {
		throw secondError;
	});

	const listener = () => {};
	const off = emitter.on(['🦄', '🐶'], listener);

	t.throws(() => {
		unsubscribe(emitter, listener, off);
	}, {is: firstError});

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 0);
});

test('off() - rethrows the first deinit error when several event names throw', rethrowsFirstDeinitError, (emitter, listener) => {
	emitter.off(['🦄', '🐶'], listener);
});

test('on() - the unsubscribe method rethrows the first deinit error when several event names throw', rethrowsFirstDeinitError, (emitter, listener, off) => {
	off();
});

test('clearListeners() - rethrows the first deinit error when several event names throw', rethrowsFirstDeinitError, emitter => {
	emitter.clearListeners(['🦄', '🐶']);
});

test('on() - the unsubscribe method calls an overridden off() once per event name', t => {
	const calls = [];
	class CustomEmittery extends Emittery {
		off(eventNames, listener) {
			calls.push(eventNames);
			super.off(eventNames, listener);
		}
	}

	const emitter = new CustomEmittery();
	const off = emitter.on(['🦄', '🐶'], () => {});
	off();

	t.deepEqual(calls, ['🦄', '🐶']);
	t.is(emitter.listenerCount(), 0);
});

test('off() - rethrows an undefined deinit throw value', t => {
	const emitter = new Emittery();
	const throwValue = value => {
		throw value;
	};

	emitter.init('🦄', () => () => {
		throwValue(undefined);
	});

	const listener = () => {};
	emitter.on('🦄', listener);

	// A sentinel is needed because `undefined` is a value a deinit can throw.
	let thrownError = Symbol('not-thrown');
	try {
		emitter.off('🦄', listener);
	} catch (error) {
		thrownError = error;
	}

	t.is(thrownError, undefined);
	t.is(emitter.listenerCount('🦄'), 0);
});

test('off() - announces listenerRemoved for every event name even when a deinit throws', async t => {
	const emitter = new Emittery();
	const removed = [];
	emitter.on(Emittery.listenerRemoved, ({data}) => {
		removed.push(data.eventName);
	});

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});
	emitter.init('🐶', () => () => {});

	const listener = () => {};
	emitter.on(['🦄', '🐶'], listener);

	t.throws(() => {
		emitter.off(['🦄', '🐶'], listener);
	}, {message: 'deinit boom'});

	// Every subscription was removed, so every removal is announced.
	await delay(20);
	t.deepEqual(removed, ['🦄', '🐶']);
});

test('off() - a throwing debug logger still unsubscribes the remaining event names', async t => {
	const emitter = new Emittery({
		debug: {
			name: 'testEmitter',
			enabled: true,
			logger(type, debugName, eventName) {
				if (type === 'unsubscribe' && eventName === '🦄') {
					throw new Error('logger boom');
				}
			},
		},
	});

	const calls = [];
	const listener = ({name}) => {
		calls.push(name);
	};

	emitter.on(['🦄', '🐶'], listener);

	const removed = [];
	emitter.on(Emittery.listenerRemoved, ({data: {eventName}}) => {
		removed.push(eventName);
	});

	t.throws(() => {
		emitter.off(['🦄', '🐶'], listener);
	}, {message: 'logger boom'});

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 0);

	await emitter.emit('🦄');
	await emitter.emit('🐶');
	t.deepEqual(calls, []);

	// Both removals happened, so both are announced, even the one whose log threw.
	t.deepEqual(removed, ['🦄', '🐶']);
});

test('off() - an invalid event name does not stop the remaining event names', async t => {
	const emitter = new Emittery();
	const removed = [];
	emitter.on(Emittery.listenerRemoved, ({data}) => {
		removed.push(data.eventName);
	});

	const listener = () => {};
	emitter.on(['🦄', '🐶', '🌈'], listener);

	t.throws(() => {
		emitter.off([null, '🦄', '🐶', '🌈'], listener);
	}, {instanceOf: TypeError});

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 0);
	t.is(emitter.listenerCount('🌈'), 0);

	await delay(20);
	t.deepEqual(removed, ['🦄', '🐶', '🌈']);
});

test('off() - an invalid event name does not swallow an earlier deinit error', t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit boom');
	const listener = () => {};

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.on('🦄', listener);
	emitter.on('🐶', listener);

	t.throws(() => {
		emitter.off(['🦄', null, '🐶'], listener);
	}, {is: deinitError});

	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🐶'), 0);
});

test('init() - works with Symbol event names', t => {
	const emitter = new Emittery();
	const myEvent = Symbol('myEvent');
	const calls = [];

	emitter.init(myEvent, () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const off = emitter.on(myEvent, () => {});
	t.deepEqual(calls, ['init']);

	off();
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - works with number event names', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init(42, () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const off = emitter.on(42, () => {});
	t.deepEqual(calls, ['init']);

	off();
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - multiple inits, off() for one event only triggers that deinit', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init:unicorn');
		return () => {
			calls.push('deinit:unicorn');
		};
	});

	emitter.init('🌈', () => {
		calls.push('init:rainbow');
		return () => {
			calls.push('deinit:rainbow');
		};
	});

	const offUnicorn = emitter.on('🦄', () => {});
	emitter.on('🌈', () => {});
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow']);

	offUnicorn();
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow', 'deinit:unicorn']);
	// Rainbow deinit NOT called — still has a listener
});

test('init() - listenerAdded meta event still fires when init is registered', async t => {
	const emitter = new Emittery();
	const events = [];

	emitter.on(Emittery.listenerAdded, ({data}) => {
		if (data.eventName === '🦄') {
			events.push('listenerAdded');
		}
	});

	emitter.init('🦄', () => {
		events.push('init');
	});

	emitter.on('🦄', () => {});

	// Init fires synchronously, listenerAdded fires asynchronously
	t.deepEqual(events, ['init']);
	await Promise.resolve();
	t.deepEqual(events, ['init', 'listenerAdded']);
});

test('init() - listenerRemoved meta event still fires when deinit runs', async t => {
	const emitter = new Emittery();
	const events = [];

	emitter.on(Emittery.listenerRemoved, ({data}) => {
		if (data.eventName === '🦄') {
			events.push('listenerRemoved');
		}
	});

	emitter.init('🦄', () => () => {
		events.push('deinit');
	});

	const off = emitter.on('🦄', () => {});
	off();

	// Deinit fires synchronously, listenerRemoved fires asynchronously
	t.deepEqual(events, ['deinit']);
	await Promise.resolve();
	t.deepEqual(events, ['deinit', 'listenerRemoved']);
});

test('init() - async initFn silently discards the resolved cleanup function', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', async () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const off = emitter.on('🦄', () => {});
	// An async initFn returns a Promise instance (typeof 'object'),
	// so the resolved cleanup function is never stored as deinitFn.
	t.deepEqual(calls, ['init']);

	// Let the promise settle to confirm the cleanup is truly discarded
	await Promise.resolve();

	off();
	// Deinit is never called even after the promise resolved
	t.deepEqual(calls, ['init']);
});

test('init() - once() with predicate keeps lifecycle active until predicate matches', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const promise = emitter.once('🦄', ({data}) => data === '🌈');
	t.deepEqual(calls, ['init']);

	// Non-matching emit — listener stays, no deinit
	await emitter.emit('🦄', '❌');
	t.deepEqual(calls, ['init']);

	// Matching emit — listener self-removes, deinit fires
	await emitter.emit('🦄', '🌈');
	await promise;
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - works through a Proxy wrapper', t => {
	const emitter = new Emittery();
	const proxy = new Proxy(emitter, {});
	const calls = [];

	proxy.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const off = proxy.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	off();
	t.deepEqual(calls, ['init', 'deinit']);
});

test('init() - onAny() does not trigger lifecycle', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const offAny = emitter.onAny(() => {});
	t.deepEqual(calls, []);

	offAny();
	t.deepEqual(calls, []);
});

test('init() - full re-init cycle via off()', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const off1 = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	off1();
	t.deepEqual(calls, ['init', 'deinit']);

	// Second cycle
	const off2 = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init', 'deinit', 'init']);

	off2();
	t.deepEqual(calls, ['init', 'deinit', 'init', 'deinit']);
});

test('init() - once() with multiple event names triggers init for both, deinit for both on fire', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init:unicorn');
		return () => {
			calls.push('deinit:unicorn');
		};
	});

	emitter.init('🌈', () => {
		calls.push('init:rainbow');
		return () => {
			calls.push('deinit:rainbow');
		};
	});

	const promise = emitter.once(['🦄', '🌈']);
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow']);

	// Firing one event removes the listener from both events
	await emitter.emit('🦄', '🌟');
	await promise;
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow', 'deinit:unicorn', 'deinit:rainbow']);
});

test('init() - once() cleanup removes all subscriptions when off() throws for one of multiple event names', async t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit boom');

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.init('🌈', () => () => {});

	const promise = emitter.once(['🦄', '🌈']);
	await emitter.emit('🦄');

	await t.throwsAsync(promise, {is: deinitError});
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);

	promise.off();
	t.is(emitter.listenerCount('🌈'), 0);
});

test('init() - once() cleanup does not leak listeners when off() throws for one of multiple event names', async t => {
	const emitter = new Emittery();
	const deinitError = new Error('deinit boom');

	emitter.init('🦄', () => () => {
		throw deinitError;
	});

	emitter.init('🌈', () => () => {});

	const promise = emitter.once(['🦄', '🌈']);
	await emitter.emit('🦄');

	await t.throwsAsync(promise, {is: deinitError});
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);

	await emitter.emit('🌈');
	t.is(emitter.listenerCount('🌈'), 0);
});

test('init() - removeInit() with no listeners ever added is a no-op', t => {
	const emitter = new Emittery();
	const calls = [];

	const removeInit = emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	// InitFn was never called, so removeInit should be a clean no-op
	removeInit();
	t.deepEqual(calls, []);
});

test('init() - off() on event with no listeners does not trigger deinit for other events', t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	// Off on a different event should not affect 🦄's lifecycle
	const listener = () => {};
	emitter.off('🌈', listener);
	t.deepEqual(calls, ['init']);
});

test('init() - events() iterator does not prevent deinit when last on() listener removed', async t => {
	const emitter = new Emittery();
	const calls = [];

	emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	const iterator = emitter.events('🦄');
	const off = emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	off();
	// Deinit should fire because the last on() listener was removed,
	// even though an events() iterator still exists
	t.deepEqual(calls, ['init', 'deinit']);

	await iterator.return();
});

test('init() - rollback deinit re-subscription does not leak orphaned deinitFn', t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => {};

	emitter.init('🦄', () => {
		calls.push('init:unicorn');
		return () => {
			calls.push('deinit:unicorn');
			emitter.on('🦄', listener);
		};
	});

	emitter.init('🌈', () => {
		calls.push('init:rainbow');
		throw new Error('init failed');
	});

	t.throws(() => {
		emitter.on(['🦄', '🌈'], listener);
	});

	// Init should NOT fire a second time during rollback (suppressed)
	t.deepEqual(calls, ['init:unicorn', 'init:rainbow', 'deinit:unicorn']);
	t.is(emitter.listenerCount('🦄'), 0);
});

// Dispose tests

test('on() - returns a disposable unsubscribe function', async t => {
	const emitter = new Emittery();
	const calls = [];
	const off = emitter.on('🦄', () => {
		calls.push(1);
	});

	t.is(typeof off[Symbol.dispose], 'function');
	t.is(off[Symbol.dispose], off);

	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	off[Symbol.dispose]();
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('onAny() - returns a disposable unsubscribe function', async t => {
	const emitter = new Emittery();
	const calls = [];
	const off = emitter.onAny(() => {
		calls.push(1);
	});

	t.is(typeof off[Symbol.dispose], 'function');
	t.is(off[Symbol.dispose], off);

	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	off[Symbol.dispose]();
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('init() - returns a disposable unsubscribe function', t => {
	const emitter = new Emittery();
	const calls = [];

	const off = emitter.init('🦄', () => {
		calls.push('init');
		return () => {
			calls.push('deinit');
		};
	});

	t.is(typeof off[Symbol.dispose], 'function');
	t.is(off[Symbol.dispose], off);

	emitter.on('🦄', () => {});
	t.deepEqual(calls, ['init']);

	off[Symbol.dispose]();
	t.deepEqual(calls, ['init', 'deinit']);
});

// Async dispose tests

test('events() - iterator is async disposable', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	t.is(typeof iterator[Symbol.asyncDispose], 'function');

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});

	await iterator[Symbol.asyncDispose]();
	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvent() - iterator is async disposable', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	t.is(typeof iterator[Symbol.asyncDispose], 'function');

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});

	await iterator[Symbol.asyncDispose]();
	t.deepEqual(await iterator.next(), {done: true});
});

// Once with signal tests

test('once() - supports signal option', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	const promise = emitter.once('🦄', {signal: abortController.signal});

	abortController.abort();

	await t.throwsAsync(promise, {name: 'AbortError'});
});

test('once() - signal with AbortSignal.timeout()', async t => {
	const emitter = new Emittery();

	const promise = emitter.once('🦄', {signal: AbortSignal.timeout(50)});

	await t.throwsAsync(promise, {name: 'TimeoutError'});
});

test('once() - pre-aborted signal', async t => {
	const emitter = new Emittery();

	const promise = emitter.once('🦄', {signal: AbortSignal.abort()});

	await t.throwsAsync(promise, {name: 'AbortError'});
});

test('once() - signal + predicate combo', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	const promise = emitter.once('data', {
		predicate: ({data}) => data.ok === true,
		signal: abortController.signal,
	});

	await emitter.emit('data', {ok: false});

	abortController.abort();

	await t.throwsAsync(promise, {name: 'AbortError'});
});

test('once() - signal does not interfere when event fires first', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	const promise = emitter.once('🦄', {signal: abortController.signal});

	emitter.emit('🦄', '🌈');

	const result = await promise;
	t.deepEqual(result, {name: '🦄', data: '🌈'});

	// Aborting after resolution should be harmless
	abortController.abort();
});

test('once() - signal cleans up listener on abort', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	const promise = emitter.once('🦄', {signal: abortController.signal});

	t.is(emitter.listenerCount('🦄'), 1);

	abortController.abort();

	await t.throwsAsync(promise, {name: 'AbortError'});

	t.is(emitter.listenerCount('🦄'), 0);
});

test('once() - signal abort rejects even if deinit throws', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});

	const promise = emitter.once('🦄', {signal: abortController.signal});
	abortController.abort();

	await t.throwsAsync(promise, {name: 'AbortError'});
	t.is(emitter.listenerCount('🦄'), 0);
});

test('once() - signal abort fully unsubscribes multiple event names when one deinit throws', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});

	emitter.init('🌈', () => () => {});

	const promise = emitter.once(['🦄', '🌈'], {signal: abortController.signal});
	abortController.abort();

	await t.throwsAsync(promise, {name: 'AbortError'});
	t.is(emitter.listenerCount('🦄'), 0);
	t.is(emitter.listenerCount('🌈'), 0);
});

test('once() - off() removes signal listener even if deinit throws', t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const {signal} = abortController;
	let abortListenerCount = 0;
	const addEventListener = signal.addEventListener.bind(signal);
	const removeEventListener = signal.removeEventListener.bind(signal);

	signal.addEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			++abortListenerCount;
		}

		addEventListener(eventName, listener, options);
	};

	signal.removeEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			--abortListenerCount;
		}

		removeEventListener(eventName, listener, options);
	};

	emitter.init('🦄', () => () => {
		throw new Error('deinit boom');
	});

	const promise = emitter.once('🦄', {signal});
	t.is(abortListenerCount, 1);
	t.throws(() => {
		promise.off();
	}, {message: 'deinit boom'});
	t.is(abortListenerCount, 0);
});

test('once() - signal aborted during setup rejects and unsubscribes', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	emitter.init('🦄', () => {
		abortController.abort();
	});

	const promise = emitter.once('🦄', {signal: abortController.signal});

	const state = await Promise.race([
		(async () => {
			try {
				await promise;
				return 'resolved';
			} catch (error) {
				return error.name;
			}
		})(),
		(async () => {
			await delay(100);
			return 'pending';
		})(),
	]);

	t.is(state, 'AbortError');
	t.is(emitter.listenerCount('🦄'), 0);
});

test('once() - matching event resolves before abort from off() cleanup', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();

	emitter.init('🦄', () => () => {
		abortController.abort();
	});

	const promise = emitter.once('🦄', {signal: abortController.signal});
	await emitter.emit('🦄', '🌈');

	t.deepEqual(await promise, {name: '🦄', data: '🌈'});
	t.true(abortController.signal.aborted);
});

test('once() - off() detaches signal abort handling', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const promise = emitter.once('🦄', {signal: abortController.signal});

	promise.off();
	abortController.abort();

	const state = await Promise.race([
		(async () => {
			try {
				await promise;
				return 'resolved';
			} catch {
				return 'rejected';
			}
		})(),
		(async () => {
			await delay(100);
			return 'pending';
		})(),
	]);

	t.is(state, 'pending');
});

// Events with signal tests

test('events() - supports signal option', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const iterator = emitter.events('🦄', {signal: abortController.signal});

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});

	abortController.abort();
	t.deepEqual(await iterator.next(), {done: true});
});

test('events() - pre-aborted signal', async t => {
	const emitter = new Emittery();
	const iterator = emitter.events('🦄', {signal: AbortSignal.abort()});

	t.deepEqual(await iterator.next(), {done: true});
});

test('events() - signal abort unregisters iterator producer', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const iterator = emitter.events('🦄', {signal: abortController.signal});

	abortController.abort();
	t.deepEqual(await iterator.next(), {done: true});
	await t.notThrowsAsync(emitter.emit('🦄', '🌈'));
	await t.notThrowsAsync(emitter.emitSerial('🦄', '🌈'));
});

test('events() - signal cleanup runs when iterator auto-finishes', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const {signal} = abortController;
	let abortListenerCount = 0;
	const addEventListener = signal.addEventListener.bind(signal);
	const removeEventListener = signal.removeEventListener.bind(signal);

	signal.addEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			++abortListenerCount;
		}

		addEventListener(eventName, listener, options);
	};

	signal.removeEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			--abortListenerCount;
		}

		removeEventListener(eventName, listener, options);
	};

	const iterator = emitter.events('🦄', {signal});
	t.is(abortListenerCount, 1);

	emitter.clearListeners('🦄');
	t.is(abortListenerCount, 0);
	t.deepEqual(await iterator.next(), {done: true});
});

// AnyEvent with signal tests

test('anyEvent() - supports signal option', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const iterator = emitter.anyEvent({signal: abortController.signal});

	await emitter.emit('🦄', '🌈');
	t.deepEqual(await iterator.next(), {done: false, value: {name: '🦄', data: '🌈'}});

	abortController.abort();
	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvent() - pre-aborted signal', async t => {
	const emitter = new Emittery();
	const iterator = emitter.anyEvent({signal: AbortSignal.abort()});

	t.deepEqual(await iterator.next(), {done: true});
});

test('anyEvent() - signal abort unregisters iterator producer', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const iterator = emitter.anyEvent({signal: abortController.signal});

	abortController.abort();
	t.deepEqual(await iterator.next(), {done: true});
	await t.notThrowsAsync(emitter.emit('🦄', '🌈'));
	await t.notThrowsAsync(emitter.emitSerial('🦄', '🌈'));
});

test('anyEvent() - signal cleanup runs when iterator auto-finishes', async t => {
	const emitter = new Emittery();
	const abortController = new AbortController();
	const {signal} = abortController;
	let abortListenerCount = 0;
	const addEventListener = signal.addEventListener.bind(signal);
	const removeEventListener = signal.removeEventListener.bind(signal);

	signal.addEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			++abortListenerCount;
		}

		addEventListener(eventName, listener, options);
	};

	signal.removeEventListener = (eventName, listener, options) => {
		if (eventName === 'abort') {
			--abortListenerCount;
		}

		removeEventListener(eventName, listener, options);
	};

	const iterator = emitter.anyEvent({signal});
	t.is(abortListenerCount, 1);

	emitter.clearListeners();
	t.is(abortListenerCount, 0);
	t.deepEqual(await iterator.next(), {done: true});
});
