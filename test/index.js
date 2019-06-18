import test from 'ava';
import delay from 'delay';
import Emittery from '..';

test('on()', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener1 = () => calls.push(1);
	const listener2 = () => calls.push(2);
	emitter.on('🦄', listener1);
	emitter.on('🦄', listener2);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 2]);
});

test('on() - eventName must be a string', t => {
	const emitter = new Emittery();

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
	const listener = () => calls.push(1);

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
	const listener = () => calls.push(1);

	emitter.on('🦄', listener);
	emitter.on('🦄', listener);
	emitter.on('🦄', listener);
	await emitter.emit('🦄');
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
	const expected = ['🌈', '🌟'];
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

	await new Promise(resolve => setTimeout(resolve, 20));

	t.deepEqual(await iterator.next(), {done: true});
});

test('off()', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => calls.push(1);

	emitter.on('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);

	emitter.off('🦄', listener);
	await emitter.emit('🦄');
	t.deepEqual(calls, [1]);
});

test('off() - eventName must be a string', t => {
	const emitter = new Emittery();

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

test('once() - eventName must be a string', async t => {
	const emitter = new Emittery();
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

test('emit() - eventName must be a string', async t => {
	const emitter = new Emittery();
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

test('emit() - calls listeners subscribed when emit() was invoked', async t => {
	const emitter = new Emittery();
	const calls = [];
	const off1 = emitter.on('🦄', () => calls.push(1));
	const p = emitter.emit('🦄');
	emitter.on('🦄', () => calls.push(2));
	await p;
	t.deepEqual(calls, [1]);

	const off3 = emitter.on('🦄', () => {
		calls.push(3);
		off1();
		emitter.on('🦄', () => calls.push(4));
	});
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3]);
	off3();

	const off5 = emitter.on('🦄', () => {
		calls.push(5);
		emitter.onAny(() => calls.push(6));
	});
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5]);
	off5();

	let off8 = null;
	emitter.on('🦄', () => {
		calls.push(7);
		off8();
	});
	off8 = emitter.on('🦄', () => calls.push(8));
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6]);

	let off10 = null;
	emitter.onAny(() => {
		calls.push(9);
		off10();
	});
	off10 = emitter.onAny(() => calls.push(10));
	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9]);

	await emitter.emit('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);

	const p2 = emitter.emit('🦄');
	emitter.clearListeners();
	await p2;
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);
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

test('emitSerial() - eventName must be a string', async t => {
	const emitter = new Emittery();
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
	const off1 = emitter.on('🦄', () => calls.push(1));
	const p = emitter.emitSerial('🦄');
	emitter.on('🦄', () => calls.push(2));
	await p;
	t.deepEqual(calls, [1]);

	const off3 = emitter.on('🦄', () => {
		calls.push(3);
		off1();
		emitter.on('🦄', () => calls.push(4));
	});
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3]);
	off3();

	const off5 = emitter.on('🦄', () => {
		calls.push(5);
		emitter.onAny(() => calls.push(6));
	});
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5]);
	off5();

	let off8 = null;
	emitter.on('🦄', () => {
		calls.push(7);
		off8();
	});
	off8 = emitter.on('🦄', () => calls.push(8));
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6]);

	let off10 = null;
	emitter.onAny(() => {
		calls.push(9);
		off10();
	});
	off10 = emitter.onAny(() => calls.push(10));
	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9]);

	await emitter.emitSerial('🦄');
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);

	const p2 = emitter.emitSerial('🦄');
	emitter.clearListeners();
	await p2;
	t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 7, 6, 2, 4, 7, 6, 9, 2, 4, 7, 6, 9]);
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

	await new Promise(resolve => setTimeout(resolve, 20));

	t.deepEqual(await iterator.next(), {done: true});
});

test('offAny()', async t => {
	const emitter = new Emittery();
	const calls = [];
	const listener = () => calls.push(1);
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
	emitter.on('🦄', () => calls.push('🦄1'));
	emitter.on('🌈', () => calls.push('🌈'));
	emitter.on('🦄', () => calls.push('🦄2'));
	emitter.onAny(() => calls.push('any1'));
	emitter.onAny(() => calls.push('any2'));
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
	emitter.on('🦄', () => calls.push('🦄1'));
	emitter.on('🌈', () => calls.push('🌈'));
	emitter.on('🦄', () => calls.push('🦄2'));
	emitter.onAny(() => calls.push('any1'));
	emitter.onAny(() => calls.push('any2'));
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2']);
	emitter.clearListeners('🦄');
	await emitter.emit('🦄');
	await emitter.emit('🌈');
	t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2', 'any1', 'any2', '🌈', 'any1', 'any2']);
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

test('listenerCount() - works with empty eventName strings', t => {
	const emitter = new Emittery();
	emitter.on('', () => {});
	t.is(emitter.listenerCount(''), 1);
});

test('listenerCount() - eventName must be undefined if not a string', t => {
	const emitter = new Emittery();

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

	t.deepEqual(Object.getOwnPropertyNames(target).sort(), oldPropertyNames.concat(methodsToBind).sort());

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
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'listenerCount', 'bindMethods'];

	const emitter = new Emittery();
	const target = {};

	const oldPropertyNames = Object.getOwnPropertyNames(target);
	emitter.bindMethods(target);

	t.deepEqual(Object.getOwnPropertyNames(target).sort(), oldPropertyNames.concat(methodsExpected).sort());

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
	const methodsExpected = ['on', 'off', 'once', 'events', 'emit', 'emitSerial', 'onAny', 'anyEvent', 'offAny', 'clearListeners', 'listenerCount', 'bindMethods'];

	class TestClass {
	}

	const TestClassWithMixin = Emittery.mixin('emitter')(TestClass);

	t.deepEqual(Object.getOwnPropertyNames(TestClassWithMixin.prototype).sort(), methodsExpected.concat(['constructor', 'emitter']).sort());
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
