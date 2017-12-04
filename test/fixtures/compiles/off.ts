import Emittery = require('../../..');

const ee = new Emittery();

ee.off('anEvent', () => undefined);
ee.off('anEvent', () => Promise.resolve());

ee.off('anEvent', data => undefined);
ee.off('anEvent', data => Promise.resolve());
