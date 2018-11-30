import test from 'ava';

let Emittery;
try {
	Emittery = require('..');
} catch (error) {
	test('does not work due to syntax errors', t => {
		t.is(error.name, 'SyntaxError');
	});
}

if (Emittery) {
	require('./_run')(Emittery);
}
