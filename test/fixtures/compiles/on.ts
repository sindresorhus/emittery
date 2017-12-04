import Emittery = require('../../..');

const ee = new Emittery();

ee.on('anEvent', () => undefined);
ee.on('anEvent', () => Promise.resolve());

ee.on('anEvent', data => undefined);
ee.on('anEvent', data => Promise.resolve());

const off = ee.on('anEvent', () => undefined);

off();
