const anyProducer = Symbol('anyProducer');
const resolvedPromise = Promise.resolve();

// Define symbols for "meta" events.
const listenerAdded = Symbol('listenerAdded');
const listenerRemoved = Symbol('listenerRemoved');

const suppressAllEnqueue = Symbol('suppressAllEnqueue');
let isGlobalDebugEnabled = false;

const isEventKeyType = key => typeof key === 'string' || typeof key === 'symbol' || typeof key === 'number';

function makeDisposable(function_) {
	function_[Symbol.dispose] = function_;
	return function_;
}

function addAbortListener(signal, listener, {swallowErrors = false} = {}) {
	if (!signal) {
		return () => {};
	}

	const onAbort = () => {
		if (swallowErrors) {
			try {
				listener();
			} catch {}

			return;
		}

		listener();
	};

	if (signal.aborted) {
		onAbort();
		return () => {};
	}

	signal.addEventListener('abort', onAbort, {once: true});

	return () => {
		signal.removeEventListener('abort', onAbort);
	};
}

function assertEventName(eventName) {
	if (!isEventKeyType(eventName)) {
		throw new TypeError('`eventName` must be a string, symbol, or number');
	}
}

function assertListener(listener) {
	if (typeof listener !== 'function') {
		throw new TypeError('listener must be a function');
	}
}

function getListeners({events}, eventName) {
	return events.get(eventName);
}

const getProducerKey = eventName => isEventKeyType(eventName) ? eventName : anyProducer;

function getEventProducers({producers}, eventName) {
	return producers.get(getProducerKey(eventName));
}

function enqueueProducers(state, eventName, eventData, hasEventData) {
	if (isEnqueueSuppressed(state, eventName)) {
		return;
	}

	const {producers} = state;
	const eventProducers = producers.get(eventName);
	// Meta events are internal bookkeeping, so they never reach "any" subscribers, just like `onAny()`.
	const anyProducers = isMetaEvent(eventName) ? undefined : producers.get(anyProducer);
	if (!eventProducers && !anyProducers?.size) {
		return;
	}

	const resolvedEventData = Promise.resolve(eventData);
	const makeEvent = async () => makeEventObject(eventName, await resolvedEventData, hasEventData);

	// A buffered event is not necessarily ever read, for example when the consumer stops iterating early, so it must not become an unhandled rejection.
	const enqueue = producer => {
		const event = makeEvent();
		// eslint-disable-next-line promise/prefer-await-to-then -- Marks the event as handled while the consumer can still observe the rejection.
		event.catch(() => {});
		producer.enqueue(event);
	};

	for (const producer of eventProducers ?? []) {
		enqueue(producer);
	}

	for (const producer of anyProducers ?? []) {
		enqueue(producer);
	}
}

function iterator(state, eventNames, {signal} = {}) {
	eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
	const producerKeys = new Set(eventNames.map(eventName => getProducerKey(eventName)));

	let isFinished = false;
	const finishedProducerKeys = new Set();
	let waiters = [];
	let queue = [];
	let removeAbortListener = () => {};

	// Every pending `next()` call waits, so all of them have to be woken up, not just the last one.
	const flush = () => {
		if (waiters.length === 0) {
			return;
		}

		const pendingWaiters = waiters;
		waiters = [];
		for (const resolve of pendingWaiters) {
			resolve();
		}
	};

	const producer = {
		enqueue(item) {
			queue.push(item);
			flush();
		},
		finish(producerKey) {
			finishedProducerKeys.add(producerKey);

			// The iterator stays alive while it is still subscribed to another event.
			if (finishedProducerKeys.size < producerKeys.size) {
				return;
			}

			isFinished = true;
			removeAbortListener();
			flush();
		},
	};

	for (const producerKey of producerKeys) {
		let set = state.producers.get(producerKey);
		if (!set) {
			set = new Set();
			state.producers.set(producerKey, set);
		}

		set.add(producer);
	}

	const removeProducer = () => {
		for (const producerKey of producerKeys) {
			const set = state.producers.get(producerKey);
			if (set) {
				set.delete(producer);
				if (set.size === 0) {
					state.producers.delete(producerKey);
				}
			}
		}
	};

	const stop = () => {
		if (!queue) {
			return;
		}

		queue = undefined;
		removeAbortListener();

		removeProducer();
		flush();
	};

	removeAbortListener = addAbortListener(signal, stop);

	async function next() {
		if (!queue) {
			return {done: true};
		}

		if (queue.length > 0) {
			let value;
			try {
				value = await queue.shift();
			} catch (error) {
				// A `for await` loop that dies on a rejected event does not close the iterator, so it has to end here instead of buffering forever.
				stop();
				throw error;
			}

			return {
				done: false,
				value,
			};
		}

		if (isFinished) {
			stop();
			return next();
		}

		const {promise, resolve} = Promise.withResolvers();
		waiters.push(resolve);
		await promise;
		return next();
	}

	return {
		next,

		async return(value) {
			stop();

			return arguments.length > 0
				? {done: true, value: await value}
				: {done: true};
		},

		[Symbol.asyncIterator]() {
			return this;
		},

		async [Symbol.asyncDispose]() {
			await this.return();
		},
	};
}

function defaultMethodNamesOrAssert(methodNames) {
	if (methodNames === undefined) {
		return allEmitteryMethods;
	}

	if (!Array.isArray(methodNames)) {
		throw new TypeError('`methodNames` must be an array of strings');
	}

	for (const methodName of methodNames) {
		if (!allEmitteryMethods.includes(methodName)) {
			if (typeof methodName !== 'string') {
				throw new TypeError('`methodNames` element must be a string');
			}

			throw new Error(`${methodName} is not Emittery method`);
		}
	}

	return methodNames;
}

const isMetaEvent = eventName => eventName === listenerAdded || eventName === listenerRemoved;

function withSuppressedEnqueue(state, eventNames, function_) {
	const keys = eventNames.some(name => !isEventKeyType(name))
		? [suppressAllEnqueue]
		: eventNames;

	const {suppressedEvents} = state;

	// Track only the keys we actually added, so re-entrant calls don't prematurely lift suppression.
	const added = [];
	for (const key of keys) {
		if (!suppressedEvents.has(key)) {
			suppressedEvents.add(key);
			added.push(key);
		}
	}

	try {
		return function_();
	} finally {
		for (const key of added) {
			suppressedEvents.delete(key);
		}
	}
}

function isEnqueueSuppressed({suppressedEvents}, eventName) {
	return suppressedEvents.has(suppressAllEnqueue) || suppressedEvents.has(eventName);
}

function callInitFn(state, lifecycle, listener, {eventName, set}) {
	try {
		const result = lifecycle.initFn();
		if (typeof result === 'function') {
			lifecycle.deinitFn = result;
		}
	} catch (error) {
		set.delete(listener);
		if (set.size === 0) {
			state.events.delete(eventName);
		}

		throw error;
	}
}

function callAndUnsetDeinitFn(lifecycle) {
	const deinitFn = lifecycle?.deinitFn;
	if (deinitFn) {
		lifecycle.deinitFn = undefined;
		deinitFn();
	}
}

const subscribeAction = 'subscribe';
const unsubscribeAction = 'unsubscribe';

function transitionEventListener(state, {eventName, listener, action, swallowLifecycleError = false, removeResubscribedListener = false}) {
	if (action === subscribeAction) {
		let set = getListeners(state, eventName);
		if (!set) {
			set = new Set();
			state.events.set(eventName, set);
		}

		const wasEmpty = set.size === 0;
		const alreadyListening = set.has(listener);
		set.add(listener);

		if (!isMetaEvent(eventName) && wasEmpty && !isEnqueueSuppressed(state, eventName)) {
			const lifecycle = state.lifecycles.get(eventName);
			if (lifecycle) {
				callInitFn(state, lifecycle, listener, {eventName, set});
			}
		}

		return !alreadyListening;
	}

	const set = getListeners(state, eventName);
	if (!set) {
		return false;
	}

	const removed = set.delete(listener);
	if (set.size === 0) {
		state.events.delete(eventName);

		const lifecycle = state.lifecycles.get(eventName);
		if (swallowLifecycleError) {
			try {
				callAndUnsetDeinitFn(lifecycle);
			} catch {}
		} else {
			callAndUnsetDeinitFn(lifecycle);
		}

		if (removeResubscribedListener) {
			// Deinit can re-subscribe the same listener; keep rollback authoritative.
			const setAfterDeinit = getListeners(state, eventName);
			setAfterDeinit?.delete(listener);
			if (setAfterDeinit?.size === 0) {
				state.events.delete(eventName);
			}
		}
	}

	return removed;
}

function finishAndClearProducers(state, eventName) {
	const producers = getEventProducers(state, eventName);
	if (producers) {
		const producerKey = getProducerKey(eventName);
		for (const producer of producers) {
			producer.finish(producerKey);
		}

		producers.clear();
	}
}

function finishAndClearAllProducers({producers}) {
	for (const [key, producerSet] of producers.entries()) {
		for (const producer of producerSet) {
			producer.finish(key);
		}

		producerSet.clear();
		producers.delete(key);
	}
}

// Unsubscribe from every event name one at a time, keeping the first error instead of stopping at it, so one failing deinit cannot leave the rest subscribed. Each name goes through `off()` separately so a subclass that overrides `off()` keeps seeing one event name per call.
function unsubscribeAll(emitter, eventNames, listener) {
	const errors = [];

	for (const eventName of eventNames) {
		try {
			emitter.off(eventName, listener);
		} catch (error) {
			errors.push(error);
		}
	}

	if (errors.length > 0) {
		throw errors[0];
	}
}

const makeEventObject = (eventName, eventData, hasEventData) =>
	hasEventData ? {name: eventName, data: eventData} : {name: eventName};

export default class Emittery {
	#state = {
		anyListeners: new Set(),
		events: new Map(),
		producers: new Map([[anyProducer, new Set()]]),
		lifecycles: new Map(),
		suppressedEvents: new Set(),
	};
	#metaEventsAllowed = 0;
	#metaEventsPermitted = 0;

	static mixin(emitteryPropertyName, methodNames) {
		methodNames = defaultMethodNamesOrAssert(methodNames);
		return (target, _context) => {
			if (typeof target !== 'function') {
				throw new TypeError('`target` must be function');
			}

			for (const methodName of methodNames) {
				if (target.prototype[methodName] !== undefined) {
					throw new Error(`The property \`${methodName}\` already exists on \`target\``);
				}
			}

			function getEmitteryProperty() {
				Object.defineProperty(this, emitteryPropertyName, {
					enumerable: false,
					value: new Emittery(),
				});
				return this[emitteryPropertyName];
			}

			Object.defineProperty(target.prototype, emitteryPropertyName, {
				enumerable: false,
				get: getEmitteryProperty,
			});

			const emitteryMethodCaller = methodName => function (...args) {
				return this[emitteryPropertyName][methodName](...args);
			};

			for (const methodName of methodNames) {
				Object.defineProperty(target.prototype, methodName, {
					enumerable: false,
					value: emitteryMethodCaller(methodName),
				});
			}

			return target;
		};
	}

	static get isDebugEnabled() {
		// In a browser environment, `globalThis.process` can potentially reference a DOM Element with a `#process` ID,
		// so instead of just type checking `globalThis.process`, we need to make sure that `globalThis.process.env` exists.
		// eslint-disable-next-line n/prefer-global/process
		if (typeof globalThis.process?.env !== 'object') {
			return isGlobalDebugEnabled;
		}

		// eslint-disable-next-line n/prefer-global/process
		const {env} = globalThis.process ?? {env: {}};
		return env.DEBUG === 'emittery' || env.DEBUG === '*' || isGlobalDebugEnabled;
	}

	static set isDebugEnabled(newValue) {
		isGlobalDebugEnabled = newValue;
	}

	constructor(options = {}) {
		for (const methodName of allEmitteryMethods) {
			Object.defineProperty(this, methodName, {
				value: this[methodName].bind(this),
				writable: true,
				enumerable: false,
				configurable: true,
			});
		}

		this.debug = options.debug ?? {};

		if (this.debug.enabled === undefined) {
			this.debug.enabled = false;
		}

		this.debug.logger ||= (type, debugName, eventName, eventData) => {
			try {
				// TODO: Use https://github.com/sindresorhus/safe-stringify when the package is more mature. Just copy-paste the code.
				eventData = JSON.stringify(eventData);
			} catch {
				eventData = `Object with the following keys failed to stringify: ${Object.keys(eventData).join(',')}`;
			}

			if (typeof eventName === 'symbol' || typeof eventName === 'number') {
				eventName = eventName.toString();
			}

			const currentTime = new Date();
			const logTime = `${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}.${currentTime.getMilliseconds()}`;
			console.log(`[${logTime}][emittery:${type}][${debugName}] Event Name: ${eventName}\n\tdata: ${eventData}`);
		};
	}

	#emitMetaEvent(eventName, eventData) {
		this.#metaEventsAllowed++;
		this.#metaEventsPermitted++;

		try {
			Emittery.prototype.emit.call(this, eventName, eventData);
		} finally {
			this.#metaEventsAllowed--;
		}
	}

	#assertMetaEventAllowed(eventName) {
		if (!isMetaEvent(eventName)) {
			return;
		}

		if (this.#metaEventsAllowed === 0 || this.#metaEventsPermitted === 0) {
			throw new TypeError('`eventName` cannot be meta event `listenerAdded` or `listenerRemoved`');
		}

		this.#metaEventsPermitted--;
	}

	#emitSubscriptionSideEffects({eventName, listener, action, swallowErrors = false}) {
		const isSubscribe = action === subscribeAction;
		const debugType = isSubscribe ? 'subscribe' : 'unsubscribe';
		const metaEvent = isSubscribe ? listenerAdded : listenerRemoved;

		// The change already happened, so it is announced before logging, which is the only step that can throw.
		if (!isMetaEvent(eventName)) {
			this.#emitMetaEvent(metaEvent, {eventName, listener});
		}

		if (swallowErrors) {
			try {
				this.logIfDebugEnabled(debugType, eventName, undefined);
			} catch {}

			return;
		}

		this.logIfDebugEnabled(debugType, eventName, undefined);
	}

	#rollbackAddedListeners(eventNames, listener) {
		withSuppressedEnqueue(this.#state, eventNames, () => {
			for (const eventName of eventNames) {
				const changed = transitionEventListener(this.#state, {
					eventName,
					listener,
					action: unsubscribeAction,
					swallowLifecycleError: true,
					removeResubscribedListener: true,
				});
				if (!changed) {
					continue;
				}

				this.#emitSubscriptionSideEffects({
					eventName,
					listener,
					action: unsubscribeAction,
					swallowErrors: true,
				});
			}
		});
	}

	logIfDebugEnabled(type, eventName, eventData) {
		if (Emittery.isDebugEnabled || this.debug.enabled) {
			this.debug.logger(type, this.debug.name, eventName, eventData);
		}
	}

	on(eventNames, listener, {signal} = {}) {
		assertListener(listener);

		// The returned unsubscribe method outlives this call, so it must not see later changes to the caller's array.
		eventNames = Array.isArray(eventNames) ? [...eventNames] : [eventNames];
		const addedEventNames = [];
		try {
			for (const eventName of eventNames) {
				assertEventName(eventName);
				const changed = transitionEventListener(this.#state, {
					eventName,
					listener,
					action: subscribeAction,
				});
				// A deduped listener is not added again, so there is nothing to report.
				if (!changed) {
					continue;
				}

				addedEventNames.push(eventName);
				this.#emitSubscriptionSideEffects({
					eventName,
					listener,
					action: subscribeAction,
				});
			}
		} catch (error) {
			this.#rollbackAddedListeners(addedEventNames, listener);
			throw error;
		}

		let removeAbortListener = () => {};
		const off = () => {
			removeAbortListener();
			unsubscribeAll(this, eventNames, listener);
		};

		removeAbortListener = addAbortListener(signal, off, {swallowErrors: true});

		return makeDisposable(off);
	}

	off(eventNames, listener) {
		assertListener(listener);

		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		const errors = [];

		// Every event name is unsubscribed even when an earlier deinit throws, and the first error is rethrown at the end, matching the other unsubscribe paths.
		for (const eventName of eventNames) {
			// An invalid name is reported without stopping the remaining names.
			try {
				assertEventName(eventName);
			} catch (error) {
				errors.push(error);
				continue;
			}

			// A throwing deinit runs after the listener was removed, so the removal still happened.
			let changed = true;
			try {
				changed = transitionEventListener(this.#state, {
					eventName,
					listener,
					action: unsubscribeAction,
				});
			} catch (error) {
				errors.push(error);
			}

			// A listener that was not subscribed is not removed, so there is nothing to report.
			if (!changed) {
				continue;
			}

			try {
				this.#emitSubscriptionSideEffects({
					eventName,
					listener,
					action: unsubscribeAction,
				});
			} catch (error) {
				errors.push(error);
			}
		}

		if (errors.length > 0) {
			throw errors[0];
		}
	}

	once(eventNames, predicateOrOptions) {
		const {promise, resolve, reject} = Promise.withResolvers();
		let off = () => {};
		let signal;
		let isSettled = false;
		let removeAbortListener = () => {};
		eventNames = Array.isArray(eventNames) ? [...eventNames] : [eventNames];

		try {
			let predicate;

			if (typeof predicateOrOptions === 'function') {
				predicate = predicateOrOptions;
			} else if (typeof predicateOrOptions === 'object' && predicateOrOptions !== null) {
				predicate = predicateOrOptions.predicate;
				signal = predicateOrOptions.signal;
			} else if (predicateOrOptions !== undefined) {
				throw new TypeError('predicate must be a function');
			}

			if (predicate !== undefined && typeof predicate !== 'function') {
				throw new TypeError('predicate must be a function');
			}

			if (signal?.aborted) {
				throw signal.reason;
			}

			let listener = () => {};
			const unsubscribe = () => {
				removeAbortListener();
				unsubscribeAll(this, eventNames, listener);
			};

			const unsubscribeAndSettle = () => {
				unsubscribe();
				isSettled = true;
			};

			listener = event => {
				if (predicate && !predicate(event)) {
					return;
				}

				if (isSettled) {
					return;
				}

				try {
					unsubscribeAndSettle();
				} catch (error) {
					reject(error);
					return;
				}

				resolve(event);
			};

			this.on(eventNames, listener);
			off = unsubscribe;

			removeAbortListener = addAbortListener(signal, () => {
				if (isSettled) {
					return;
				}

				try {
					unsubscribeAndSettle();
				} catch {}

				// A throwing unsubscribe skips the assignment inside it, but the promise must settle either way.
				isSettled = true;
				reject(signal.reason);
			});

			promise.off = () => {
				if (isSettled) {
					return;
				}

				unsubscribeAndSettle();
			};
		} catch (error) {
			reject(error);
		}

		if (promise.off === undefined) {
			promise.off = off;
		}

		return promise;
	}

	events(eventNames, {signal} = {}) {
		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		for (const eventName of eventNames) {
			assertEventName(eventName);
		}

		return iterator(this.#state, eventNames, {signal});
	}

	async emit(eventName, eventData) {
		assertEventName(eventName);
		this.#assertMetaEventAllowed(eventName);

		if (!isMetaEvent(eventName)) {
			this.logIfDebugEnabled('emit', eventName, eventData);
		}

		const hasEventData = arguments.length > 1;

		enqueueProducers(this.#state, eventName, eventData, hasEventData);

		const listeners = getListeners(this.#state, eventName) ?? new Set();
		const {anyListeners} = this.#state;
		const staticListeners = [...listeners];
		const staticAnyListeners = isMetaEvent(eventName) ? [] : [...anyListeners];

		await resolvedPromise;
		const results = await Promise.allSettled([
			...staticListeners.map(async listener => {
				if (listeners.has(listener)) {
					return listener(makeEventObject(eventName, eventData, hasEventData));
				}
			}),
			...staticAnyListeners.map(async listener => {
				if (anyListeners.has(listener)) {
					return listener(makeEventObject(eventName, eventData, hasEventData));
				}
			}),
		]);

		const errors = results.values()
			.filter(result => result.status === 'rejected')
			.map(result => result.reason)
			.toArray();

		if (errors.length > 0) {
			throw new AggregateError(errors, 'One or more listeners threw an error');
		}
	}

	async emitSerial(eventName, eventData) {
		assertEventName(eventName);
		this.#assertMetaEventAllowed(eventName);

		if (!isMetaEvent(eventName)) {
			this.logIfDebugEnabled('emitSerial', eventName, eventData);
		}

		const hasEventData = arguments.length > 1;

		enqueueProducers(this.#state, eventName, eventData, hasEventData);

		const listeners = getListeners(this.#state, eventName) ?? new Set();
		const {anyListeners} = this.#state;
		const staticListeners = [...listeners];
		const staticAnyListeners = isMetaEvent(eventName) ? [] : [...anyListeners];

		await resolvedPromise;
		/* eslint-disable no-await-in-loop */
		for (const listener of staticListeners) {
			if (listeners.has(listener)) {
				await listener(makeEventObject(eventName, eventData, hasEventData));
			}
		}

		for (const listener of staticAnyListeners) {
			if (anyListeners.has(listener)) {
				await listener(makeEventObject(eventName, eventData, hasEventData));
			}
		}
		/* eslint-enable no-await-in-loop */
	}

	onAny(listener, {signal} = {}) {
		assertListener(listener);

		// A deduped listener is not added again, so there is nothing to report.
		if (!this.#state.anyListeners.has(listener)) {
			this.logIfDebugEnabled('subscribeAny', undefined, undefined);

			this.#state.anyListeners.add(listener);
			this.#emitMetaEvent(listenerAdded, {listener});
		}

		let removeAbortListener = () => {};
		const offAny = () => {
			removeAbortListener();
			this.offAny(listener);
		};

		removeAbortListener = addAbortListener(signal, offAny, {swallowErrors: true});

		return makeDisposable(offAny);
	}

	anyEvent({signal} = {}) {
		return iterator(this.#state, undefined, {signal});
	}

	offAny(listener) {
		assertListener(listener);

		// Unsubscribe before the side effects so a throwing debug logger or meta listener cannot keep the listener alive.
		if (!this.#state.anyListeners.delete(listener)) {
			return;
		}

		this.#emitMetaEvent(listenerRemoved, {listener});

		this.logIfDebugEnabled('unsubscribeAny', undefined, undefined);
	}

	clearListeners(eventNames) {
		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		const shouldClearAll = eventNames.some(eventName => !isEventKeyType(eventName));

		withSuppressedEnqueue(this.#state, eventNames, () => {
			const errors = [];

			try {
				for (const eventName of eventNames) {
					try {
						this.logIfDebugEnabled('clear', eventName, undefined);
					} catch (error) {
						errors.push(error);
					}

					if (isEventKeyType(eventName)) {
						const set = getListeners(this.#state, eventName);
						const hadListeners = set?.size > 0;
						set?.clear();
						finishAndClearProducers(this.#state, eventName);

						const lifecycle = hadListeners ? this.#state.lifecycles.get(eventName) : undefined;
						try {
							callAndUnsetDeinitFn(lifecycle);
						} catch (error) {
							errors.push(error);
						}
					} else {
						this.#state.anyListeners.clear();
						finishAndClearAllProducers(this.#state);

						for (const [eventName, listeners] of this.#state.events.entries()) {
							const hadListeners = listeners.size > 0;
							listeners.clear();

							const lifecycle = hadListeners ? this.#state.lifecycles.get(eventName) : undefined;
							try {
								callAndUnsetDeinitFn(lifecycle);
							} catch (error) {
								errors.push(error);
							}

							// Re-clear in case deinit re-subscribed.
							listeners.clear();
							this.#state.events.delete(eventName);
						}

						// Re-clear in case deinit re-subscribed to onAny() or created new iterators.
						this.#state.anyListeners.clear();
						finishAndClearAllProducers(this.#state);
					}
				}
			} finally {
				if (shouldClearAll) {
					this.#state.anyListeners.clear();
					for (const listeners of this.#state.events.values()) {
						listeners.clear();
					}

					this.#state.events.clear();
					finishAndClearAllProducers(this.#state);
				} else {
					// Final re-clear for cross-event deinit re-subscription (e.g., deinit for B re-subscribes to A).
					for (const eventName of eventNames) {
						if (isEventKeyType(eventName)) {
							const set = getListeners(this.#state, eventName);
							set?.clear();
							this.#state.events.delete(eventName);
							finishAndClearProducers(this.#state, eventName);
						}
					}
				}
			}

			if (errors.length > 0) {
				throw errors[0];
			}
		});
	}

	init(eventName, initFn) {
		assertEventName(eventName);

		if (isMetaEvent(eventName)) {
			throw new TypeError('`eventName` cannot be a meta event');
		}

		if (typeof initFn !== 'function') {
			throw new TypeError('`initFn` must be a function');
		}

		const {lifecycles} = this.#state;

		if (lifecycles.has(eventName)) {
			throw new Error('`eventName` already has an init function registered');
		}

		const lifecycle = {initFn, deinitFn: undefined};
		lifecycles.set(eventName, lifecycle);

		// If listeners already exist, call init immediately
		const existingListeners = getListeners(this.#state, eventName);
		if (existingListeners?.size > 0) {
			try {
				const result = initFn();
				if (typeof result === 'function') {
					lifecycle.deinitFn = result;
				}
			} catch (error) {
				lifecycles.delete(eventName);
				throw error;
			}
		}

		return makeDisposable(() => {
			try {
				callAndUnsetDeinitFn(lifecycle);
			} finally {
				if (lifecycles.get(eventName) === lifecycle) {
					lifecycles.delete(eventName);
				}
			}
		});
	}

	listenerCount(eventNames) {
		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		let count = 0;

		for (const eventName of eventNames) {
			if (isEventKeyType(eventName)) {
				count += this.#state.anyListeners.size
					+ (getListeners(this.#state, eventName)?.size ?? 0)
					+ (getEventProducers(this.#state, eventName)?.size ?? 0)
					+ (getEventProducers(this.#state)?.size ?? 0);

				continue;
			}

			if (eventName !== undefined) {
				assertEventName(eventName);
			}

			count += this.#state.anyListeners.size;

			for (const value of this.#state.events.values()) {
				count += value.size;
			}

			for (const value of this.#state.producers.values()) {
				count += value.size;
			}
		}

		return count;
	}

	bindMethods(target, methodNames) {
		if (!target || typeof target !== 'object') {
			throw new TypeError('`target` must be an object');
		}

		methodNames = defaultMethodNamesOrAssert(methodNames);

		for (const methodName of methodNames) {
			if (target[methodName] !== undefined) {
				throw new Error(`The property \`${methodName}\` already exists on \`target\``);
			}

			Object.defineProperty(target, methodName, {
				enumerable: false,
				value: this[methodName].bind(this),
			});
		}
	}
}

const allEmitteryMethods = Object.getOwnPropertyNames(Emittery.prototype).filter(v => v !== 'constructor');

Object.defineProperty(Emittery, 'listenerAdded', {
	value: listenerAdded,
	writable: false,
	enumerable: true,
	configurable: false,
});
Object.defineProperty(Emittery, 'listenerRemoved', {
	value: listenerRemoved,
	writable: false,
	enumerable: true,
	configurable: false,
});
