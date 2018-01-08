'use strict';

const anyMap = new WeakMap();
const eventsMap = new WeakMap();
const resolvedPromise = Promise.resolve();

function assertEventName(eventName) {
	if (typeof eventName !== 'string') {
		throw new TypeError('eventName must be a string');
	}
}

function getListeners(instance, eventName) {
	const events = eventsMap.get(instance);
	if (!events.has(eventName)) {
		events.set(eventName, new Set());
	}

	return events.get(eventName);
}

class Emittery {
	constructor() {
		anyMap.set(this, new Set());
		eventsMap.set(this, new Map());
	}

	on(eventName, listener) {
		assertEventName(eventName);
		getListeners(this, eventName).add(listener);
		return this.off.bind(this, eventName, listener);
	}

	off(eventName, listener) {
		assertEventName(eventName);
		if (listener) {
			getListeners(this, eventName).delete(listener);
		} else {
			getListeners(this, eventName).clear();
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
		const listeners = [...getListeners(this, eventName)];
		const anyListeners = [...anyMap.get(this)];

		await resolvedPromise;
		return Promise.all([
			...listeners.map(async listener => listener(eventData)),
			...anyListeners.map(async listener => listener(eventName, eventData))
		]);
	}

	async emitSerial(eventName, eventData) {
		assertEventName(eventName);
		const listeners = [...getListeners(this, eventName)];
		const anyListeners = [...anyMap.get(this)];

		await resolvedPromise;
		/* eslint-disable no-await-in-loop */
		for (const listener of listeners) {
			await listener(eventData);
		}

		for (const listener of anyListeners) {
			await listener(eventName, eventData);
		}
		/* eslint-enable no-await-in-loop */
	}

	onAny(listener) {
		anyMap.get(this).add(listener);
		return this.offAny.bind(this, listener);
	}

	offAny(listener) {
		if (listener) {
			anyMap.get(this).delete(listener);
		} else {
			anyMap.get(this).clear();
		}
	}

	clear() {
		anyMap.get(this).clear();
		eventsMap.get(this).clear();
	}

	listenerCount(eventName) {
		if (typeof eventName === 'string') {
			return anyMap.get(this).size + getListeners(this, eventName).size;
		}

		if (typeof eventName !== 'undefined') {
			assertEventName(eventName);
		}

		let count = anyMap.get(this).size;

		for (const value of eventsMap.get(this).values()) {
			count += value.size;
		}

		return count;
	}
}

// Subclass used to encourage TS users to type their events.
Emittery.Typed = class extends Emittery {};
Object.defineProperty(Emittery.Typed, 'Typed', {
	enumerable: false,
	value: undefined
});

module.exports = Emittery;
