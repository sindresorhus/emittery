import test from 'ava';

let Emittery;
try {
	Emittery = require('../iterator');
} catch (err) {
	test('does not work due to syntax errors', t => {
		t.is(err.name, 'SyntaxError');
	});
}

if (Emittery) {
	require('./_run')(Emittery);
	/* eslint-disable ava/no-async-fn-without-await */
	test('on() - async iterator (for await)', async t => {
		t.plan(3);
		const fixture = '🌈';
		const emitter = new Emittery();
		setInterval(() => {
			emitter.emit('🦄', fixture);
		}, 50);
		let count = 0;
		for await (const data of emitter.on('🦄')) {
			count++;
			if (count >= 3) {
				break;
			}
			t.deepEqual(data, fixture);
		}
	});
	/* eslint-enable ava/no-async-fn-without-await */

	test('on() - async iterator', async t => {
		const fixture = '🌈';
		const emitter = new Emittery();
		const iterator = emitter.on('🦄');
		emitter.emit('🦄', fixture);
		const {value, done} = await iterator.next();
		t.deepEqual(done, false);
		t.deepEqual(value, fixture);
	});
}

