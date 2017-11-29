import test from 'ava';

let Emittery;
try {
	Emittery = require('..');
} catch (err) {
	test('does not work due to syntax errors', t => {
		t.is(err.name, 'SyntaxError');
	});
}

if (Emittery) {
	require('./_run')(Emittery);
}
