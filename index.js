'use strict';

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
		this._getListeners(eventName).add(listener);
		return this.off.bind(this, eventName, listener);
	}

	off(eventName, listener) {
		if (!listener) {
			this._getListeners(eventName).clear();
			return;
		}

		this._getListeners(eventName).delete(listener);
	}

	once(eventName) {
		return new Promise(resolve => {
			const off = this.on(eventName, data => {
				off();
				resolve(data);
			});
		});
	}

	async emit(eventName, eventData) {
		const listeners = [...this._getListeners(eventName)].map(listener => listener(eventData));
		const anyListeners = [...this._anyEvents].map(listener => listener(eventName, eventData));
		return Promise.all([...listeners, ...anyListeners]);
	}

	async emitSerial(eventName, eventData) {
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
		if (!listener) {
			this._anyEvents.clear();
			return;
		}

		this._anyEvents.delete(listener);
	}

	clear() {
		this._events.clear();
		this._anyEvents.clear();
	}

	listenerCount(eventName) {
		if (!eventName) {
			let count = this._anyEvents.size;

			for (const value of this._events.values()) {
				count += value.size;
			}

			return count;
		}

		return this._anyEvents.size + this._getListeners(eventName).size;
	}
};
