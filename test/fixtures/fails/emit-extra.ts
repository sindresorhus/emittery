import Emittery  = require('../../..');

const ee = new Emittery();

ee.emit('anEvent');
ee.emit('anEvent', 'some data', 'and more');
