'use strict';
const assertEventName = require('./util');
const EmitteryClass = require('./index');

async function * iterator(emitter, eventName) {
	const queue = [];
	const off = emitter.on(eventName, data => {
		queue.push(data);
	});

	try {
		/* eslint-disable no-constant-condition */
		/* eslint-disable no-await-in-loop */
		while (true) {
			if (queue.length > 0) {
				yield queue.shift();
			} else {
				await emitter.once(eventName);
			}
		}
		/* eslint-enable no-constant-condition */
		/* eslint-enable no-await-in-loop */
	} finally {
		off();
	}
}

module.exports = class IterableEmittery extends EmitteryClass {
	on(eventName, listener) {
		assertEventName(eventName);
		if (typeof listener === 'function') {
			this._getListeners(eventName).add(listener);
			return this.off.bind(this, eventName, listener);
		}
		return iterator(this, eventName);
	}
};
