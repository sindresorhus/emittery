import test from 'ava';
import delay from 'delay';

module.exports = Emittery => {
	test('on()', t => {
		const emitter = new Emittery();
		const listener1 = () => {};
		const listener2 = () => {};
		emitter.on('🦄', listener1);
		emitter.on('🦄', listener2);
		t.deepEqual([...emitter._events.get('🦄')], [listener1, listener2]);
	});

	test('on() - eventName must be a string', t => {
		const emitter = new Emittery();
		t.throws(() => emitter.on(42, () => {}), TypeError);
	});

	test('on() - returns a unsubcribe method', t => {
		const emitter = new Emittery();
		const listener = () => {};

		const off = emitter.on('🦄', listener);
		t.true(emitter._events.get('🦄').has(listener));

		off();
		t.false(emitter._events.get('🦄').has(listener));
	});

	test('on() - dedupes identical listeners', t => {
		const emitter = new Emittery();
		const listener = () => {};

		emitter.on('🦄', listener);
		emitter.on('🦄', listener);
		emitter.on('🦄', listener);
		t.is(emitter._events.get('🦄').size, 1);
	});

	/* eslint-disable ava/no-async-fn-without-await */
	test('on() - async iterator', async t => {
		const fixture = '🌈';
		const emitter = new Emittery();
		setTimeout(() => {
			emitter.emit('🦄', fixture);
		}, 300);
		const iterator = emitter.on('🦄');
		const {value, done} = await iterator.next();
		t.deepEqual(done, false);
		t.deepEqual(value, fixture);
	});
	/* eslint-enable ava/no-async-fn-without-await */

	/* eslint-disable ava/no-async-fn-without-await */
	test.cb('on() - async iterator (queued)', t => {
		const fixture = '🌈';
		const emitter = new Emittery();
		const iterator = emitter.on('🦄');
		emitter.emit('🦄', fixture);
		setTimeout(async () => {
			const {value, done} = await iterator.next();
			t.deepEqual(done, false);
			t.deepEqual(value, fixture);
			t.end();
		}, 300);
	});
	/* eslint-enable ava/no-async-fn-without-await */

	test('off()', t => {
		const emitter = new Emittery();
		const listener = () => {};

		emitter.on('🦄', listener);
		t.is(emitter._events.get('🦄').size, 1);

		emitter.off('🦄', listener);
		t.is(emitter._events.get('🦄').size, 0);
	});

	test('off() - eventName must be a string', t => {
		const emitter = new Emittery();
		t.throws(() => emitter.off(42), TypeError);
	});

	test('off() - all listeners', t => {
		const emitter = new Emittery();

		emitter.on('🦄', () => {});
		emitter.on('🦄', () => {});
		t.is(emitter._events.get('🦄').size, 2);

		emitter.off('🦄');
		t.is(emitter._events.get('🦄').size, 0);
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

	test('offAny()', t => {
		const emitter = new Emittery();
		const listener = () => {};
		emitter.onAny(listener);
		t.is(emitter._anyEvents.size, 1);
		emitter.offAny(listener);
		t.is(emitter._anyEvents.size, 0);
	});

	test('offAny() - all listeners', t => {
		const emitter = new Emittery();
		emitter.onAny(() => {});
		emitter.onAny(() => {});
		emitter.onAny(() => {});
		t.is(emitter._anyEvents.size, 3);
		emitter.offAny();
		t.is(emitter._anyEvents.size, 0);
	});

	test('clear()', t => {
		const emitter = new Emittery();
		emitter.on('🦄', () => {});
		emitter.on('🌈', () => {});
		emitter.on('🦄', () => {});
		emitter.onAny(() => {});
		emitter.onAny(() => {});
		t.is(emitter._events.size, 2);
		t.is(emitter._anyEvents.size, 2);
		emitter.clear();
		t.is(emitter._events.size, 0);
		t.is(emitter._anyEvents.size, 0);
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
