import Emittery = require('../../..');

const ee = new Emittery();

ee.on('anEvent', (data, more) => undefined);

