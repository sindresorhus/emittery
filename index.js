'use strict';

const anyMap = new WeakMap();
const eventsMap = new WeakMap();
const producersMap = new WeakMap();
const anyProducer = Symbol('anyProducer');
const resolvedPromise = Promise.resolve();

function assertEventName(eventName) {
	if (typeof eventName !== 'string') {
		throw new TypeError('eventName must be a string');
	}
}

function assertListener(listener) {
	if (typeof listener !== 'function') {
		throw new TypeError('listener must be a function');
	}
}

function getListeners(instance, eventName) {
	const events = eventsMap.get(instance);
	if (!events.has(eventName)) {
		events.set(eventName, new Set());
	}
	return events.get(eventName);
}

function getEventProducers(instance, eventName) {
	const key = typeof eventName === 'string' ? eventName : anyProducer;
	const producers = producersMap.get(instance);
	if (!producers.has(key)) {
		producers.set(key, new Set());
	}
	return producers.get(key);
}

function iterator(instance, eventName) {
	let finished = false;
	let flush = () => {};
	let queue = [];
	const producer = {
		enqueue(item) {
			queue.push(item);
			flush();
		},
		finish() {
			finished = true;
			flush();
		}
	};

	getEventProducers(instance, eventName).add(producer);
	return {
		async next() {
			if (!queue) {
				return {done: true};
			}

			if (queue.length === 0) {
				if (finished) {
					queue = null;
					return this.next();
				}

				await new Promise(resolve => {
					flush = resolve;
				});
				return this.next();
			}

			return {done: false, value: await queue.shift()};
		},
		async return(value) {
			queue = null;
			getEventProducers(instance, eventName).delete(producer);
			flush();
			return arguments.length > 0 ?
				{done: true, value: await value} :
				{done: true};
		},
		[Symbol.asyncIterator]() {
			return this;
		}
	};
}

function enqueueProducers(instance, eventName, eventData) {
	const producers = producersMap.get(instance);
	if (producers.has(eventName)) {
		for (const producer of producers.get(eventName)) {
			producer.enqueue(eventData);
		}
	}
	if (producers.has(anyProducer)) {
		const item = Promise.all([eventName, eventData]);
		for (const producer of producers.get(anyProducer)) {
			producer.enqueue(item);
		}
	}
}

class Emittery {
	constructor() {
		anyMap.set(this, new Set());
		eventsMap.set(this, new Map());
		producersMap.set(this, new Map());
	}

	on(eventName, listener) {
		assertEventName(eventName);
		assertListener(listener);
		getListeners(this, eventName).add(listener);
		return this.off.bind(this, eventName, listener);
	}

	off(eventName, listener) {
		assertEventName(eventName);
		assertListener(listener);
		getListeners(this, eventName).delete(listener);
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

	events(eventName) {
		assertEventName(eventName);
		return iterator(this, eventName);
	}

	async emit(eventName, eventData) {
		assertEventName(eventName);

		enqueueProducers(this, eventName, eventData);

		const listeners = getListeners(this, eventName);
		const anyListeners = anyMap.get(this);
		const staticListeners = [...listeners];
		const staticAnyListeners = [...anyListeners];

		await resolvedPromise;
		return Promise.all([
			...staticListeners.map(async listener => {
				if (listeners.has(listener)) {
					return listener(eventData);
				}
			}),
			...staticAnyListeners.map(async listener => {
				if (anyListeners.has(listener)) {
					return listener(eventName, eventData);
				}
			})
		]);
	}

	async emitSerial(eventName, eventData) {
		assertEventName(eventName);

		enqueueProducers(this, eventName, eventData);

		const listeners = getListeners(this, eventName);
		const anyListeners = anyMap.get(this);
		const staticListeners = [...listeners];
		const staticAnyListeners = [...anyListeners];

		await resolvedPromise;
		/* eslint-disable no-await-in-loop */
		for (const listener of staticListeners) {
			if (listeners.has(listener)) {
				await listener(eventData);
			}
		}

		for (const listener of staticAnyListeners) {
			if (anyListeners.has(listener)) {
				await listener(eventName, eventData);
			}
		}
		/* eslint-enable no-await-in-loop */
	}

	onAny(listener) {
		assertListener(listener);
		anyMap.get(this).add(listener);
		return this.offAny.bind(this, listener);
	}

	offAny(listener) {
		assertListener(listener);
		anyMap.get(this).delete(listener);
	}

	anyEvent() {
		return iterator(this);
	}

	clearListeners(eventName) {
		if (typeof eventName === 'string') {
			getListeners(this, eventName).clear();
			const producers = getEventProducers(this, eventName);
			for (const producer of producers) {
				producer.finish();
			}
			producers.clear();
		} else {
			anyMap.get(this).clear();
			for (const listeners of eventsMap.get(this).values()) {
				listeners.clear();
			}
			for (const producers of producersMap.get(this).values()) {
				for (const producer of producers) {
					producer.finish();
				}
				producers.clear();
			}
		}
	}

	listenerCount(eventName) {
		if (typeof eventName === 'string') {
			return anyMap.get(this).size + getListeners(this, eventName).size +
				getEventProducers(this, eventName).size + getEventProducers(this).size;
		}

		if (typeof eventName !== 'undefined') {
			assertEventName(eventName);
		}

		let count = anyMap.get(this).size;

		for (const value of eventsMap.get(this).values()) {
			count += value.size;
		}
		for (const value of producersMap.get(this).values()) {
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
