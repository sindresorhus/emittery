'use strict';

const resolvedPromise = Promise.resolve();

function assertEventName(eventName) {
	if (typeof eventName !== 'string') {
		throw new TypeError('eventName must be a string');
	}
}

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
				yield await emitter.once(eventName);
			}
		}
		/* eslint-enable no-constant-condition */
		/* eslint-enable no-await-in-loop */
	} finally {
		off();
	}
}

module.exports = class Emittery {
	constructor() {
		this._events = new Map();
		this._anyEvents = new Set();
	}

	_getListeners(eventName) {
		if (!this._events.has(eventName)) {
			this._events.set(eventName, new Set());
		}

		return this._events.get(eventName);
	}

	on(eventName, listener) {
		assertEventName(eventName);

		if (typeof listener === 'function') {
			this._getListeners(eventName).add(listener);
			return this.off.bind(this, eventName, listener);
		}

		return iterator(this, eventName);
	}

	off(eventName, listener) {
		assertEventName(eventName);
		if (listener) {
			this._getListeners(eventName).delete(listener);
		} else {
			this._getListeners(eventName).clear();
		}
	}

	once(eventName) {
		return new Promise(resolve => {
			assertEventName(eventName);
			const off = this.on(eventName, data => {
				off();
				resolve(data);
			});
		});
	}

	async emit(eventName, eventData) {
		assertEventName(eventName);
		await resolvedPromise;
		const listeners = [...this._getListeners(eventName)].map(async listener => listener(eventData));
		const anyListeners = [...this._anyEvents].map(async listener => listener(eventName, eventData));
		return Promise.all([...listeners, ...anyListeners]);
	}

	async emitSerial(eventName, eventData) {
		assertEventName(eventName);
		await resolvedPromise;

		/* eslint-disable no-await-in-loop */
		for (const listener of this._getListeners(eventName)) {
			await listener(eventData);
		}

		for (const listener of this._anyEvents) {
			await listener(eventName, eventData);
		}
		/* eslint-enable no-await-in-loop */
	}

	onAny(listener) {
		this._anyEvents.add(listener);
		return this.offAny.bind(this, listener);
	}

	offAny(listener) {
		if (listener) {
			this._anyEvents.delete(listener);
		} else {
			this._anyEvents.clear();
		}
	}

	clear() {
		this._events.clear();
		this._anyEvents.clear();
	}

	listenerCount(eventName) {
		if (typeof eventName === 'string') {
			return this._anyEvents.size + this._getListeners(eventName).size;
		}

		if (typeof eventName !== 'undefined') {
			assertEventName(eventName);
		}

		let count = this._anyEvents.size;

		for (const value of this._events.values()) {
			count += value.size;
		}

		return count;
	}
};
