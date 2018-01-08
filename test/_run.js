import test from 'ava';
import delay from 'delay';

module.exports = Emittery => {
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
		t.throws(() => emitter.on(42, () => {}), TypeError);
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
		t.throws(() => emitter.off(42), TypeError);
	});

	test('off() - all listeners', async t => {
		const emitter = new Emittery();
		const calls = [];

		emitter.on('🦄', () => calls.push(1));
		emitter.on('🦄', () => calls.push(2));
		await emitter.emit('🦄');
		t.deepEqual(calls, [1, 2]);

		emitter.off('🦄');
		await emitter.emit('🦄');
		t.deepEqual(calls, [1, 2]);
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
		await t.throws(emitter.once(42), TypeError);
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
		await t.throws(emitter.emit(42), TypeError);
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
		emitter.onAny(() => {
			calls.push(7);
			off8();
		});
		off8 = emitter.onAny(() => calls.push(8));
		await emitter.emit('🦄');
		t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 6, 7, 8]);

		await emitter.emit('🦄');
		t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 6, 7, 8, 2, 4, 6, 7]);
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
		await t.throws(emitter.emitSerial(42), TypeError);
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
		emitter.onAny(() => {
			calls.push(7);
			off8();
		});
		off8 = emitter.onAny(() => calls.push(8));
		await emitter.emitSerial('🦄');
		t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 6, 7, 8]);

		await emitter.emitSerial('🦄');
		t.deepEqual(calls, [1, 1, 2, 3, 2, 4, 5, 2, 4, 6, 7, 8, 2, 4, 6, 7]);
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

	test('offAny() - all listeners', async t => {
		const emitter = new Emittery();
		const calls = [];
		emitter.onAny(() => calls.push(1));
		emitter.onAny(() => calls.push(2));
		emitter.onAny(() => calls.push(3));
		await emitter.emit('🦄');
		t.deepEqual(calls, [1, 2, 3]);
		emitter.offAny();
		await emitter.emit('🦄');
		t.deepEqual(calls, [1, 2, 3]);
	});

	test('clear()', async t => {
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
		emitter.clear();
		await emitter.emit('🦄');
		await emitter.emit('🌈');
		t.deepEqual(calls, ['🦄1', '🦄2', 'any1', 'any2', '🌈', 'any1', 'any2']);
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
		t.throws(() => emitter.listenerCount(42), TypeError);
	});
};
