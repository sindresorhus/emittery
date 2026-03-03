import {
	anyMap,
	producersMap,
	eventsMap,
	lifecycleMap,
} from './maps.js';

const anyProducer = Symbol('anyProducer');
const resolvedPromise = Promise.resolve();

// Define symbols for "meta" events.
const listenerAdded = Symbol('listenerAdded');
const listenerRemoved = Symbol('listenerRemoved');

const metaEventsAllowed = new WeakMap();
const metaEventsPermitted = new WeakMap();
const suppressAllEnqueue = Symbol('suppressAllEnqueue');
const suppressedEventsMap = new WeakMap();
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

function getListeners(instance, eventName) {
	const events = eventsMap.get(instance);
	if (!events.has(eventName)) {
		return;
	}

	return events.get(eventName);
}

function getEventProducers(instance, eventName) {
	const key = isEventKeyType(eventName) ? eventName : anyProducer;
	const producers = producersMap.get(instance);
	if (!producers.has(key)) {
		return;
	}

	return producers.get(key);
}

function enqueueProducers(instance, eventName, eventData, hasEventData) {
	if (isEnqueueSuppressed(instance, eventName)) {
		return;
	}

	const producers = producersMap.get(instance);
	if (!producers.has(eventName) && !producers.get(anyProducer)?.size) {
		return;
	}

	const resolvedEventData = Promise.resolve(eventData);
	const makeEvent = async () => makeEventObject(eventName, await resolvedEventData, hasEventData);

	if (producers.has(eventName)) {
		for (const producer of producers.get(eventName)) {
			producer.enqueue(makeEvent());
		}
	}

	if (producers.has(anyProducer)) {
		for (const producer of producers.get(anyProducer)) {
			producer.enqueue(makeEvent());
		}
	}
}

function iterator(instance, eventNames, {signal} = {}) {
	eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];

	let isFinished = false;
	let flush = () => {};
	let queue = [];
	let removeAbortListener = () => {};

	const producer = {
		enqueue(item) {
			queue.push(item);
			flush();
		},
		finish() {
			isFinished = true;
			removeAbortListener();
			flush();
		},
	};

	for (const eventName of eventNames) {
		const producerKey = isEventKeyType(eventName) ? eventName : anyProducer;
		let set = getEventProducers(instance, eventName);
		if (!set) {
			set = new Set();
			const producers = producersMap.get(instance);
			producers.set(producerKey, set);
		}

		set.add(producer);
	}

	const removeProducer = () => {
		for (const eventName of eventNames) {
			const producerKey = isEventKeyType(eventName) ? eventName : anyProducer;
			const set = getEventProducers(instance, eventName);
			if (set) {
				set.delete(producer);
				if (set.size === 0) {
					const producers = producersMap.get(instance);
					producers.delete(producerKey);
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

	return {
		async next() {
			if (!queue) {
				return {done: true};
			}

			if (queue.length === 0) {
				if (isFinished) {
					stop();
					return this.next();
				}

				const {promise, resolve} = Promise.withResolvers();
				flush = resolve;
				await promise;

				return this.next();
			}

			return {
				done: false,
				value: await queue.shift(),
			};
		},

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

function withSuppressedEnqueue(instance, eventNames, function_) {
	const keys = eventNames.some(name => !isEventKeyType(name))
		? [suppressAllEnqueue]
		: eventNames;

	let suppressed = suppressedEventsMap.get(instance);
	if (!suppressed) {
		suppressed = new Set();
		suppressedEventsMap.set(instance, suppressed);
	}

	// Track only the keys we actually added, so re-entrant calls don't prematurely lift suppression.
	const added = [];
	for (const key of keys) {
		if (!suppressed.has(key)) {
			suppressed.add(key);
			added.push(key);
		}
	}

	try {
		return function_();
	} finally {
		for (const key of added) {
			suppressed.delete(key);
		}

		if (suppressed.size === 0) {
			suppressedEventsMap.delete(instance);
		}
	}
}

function isEnqueueSuppressed(instance, eventName) {
	const suppressed = suppressedEventsMap.get(instance);
	if (!suppressed) {
		return false;
	}

	return suppressed.has(suppressAllEnqueue) || suppressed.has(eventName);
}

function callInitFn(instance, lifecycle, listener, {eventName, set}) {
	try {
		const result = lifecycle.initFn();
		if (typeof result === 'function') {
			lifecycle.deinitFn = result;
		}
	} catch (error) {
		set.delete(listener);
		if (set.size === 0) {
			eventsMap.get(instance).delete(eventName);
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

function transitionEventListener(instance, {eventName, listener, action, swallowLifecycleError = false, removeResubscribedListener = false}) {
	if (action === subscribeAction) {
		let set = getListeners(instance, eventName);
		if (!set) {
			set = new Set();
			eventsMap.get(instance).set(eventName, set);
		}

		const wasEmpty = set.size === 0;
		const alreadyListening = set.has(listener);
		set.add(listener);

		if (!isMetaEvent(eventName) && wasEmpty && !isEnqueueSuppressed(instance, eventName)) {
			const lifecycle = lifecycleMap.get(instance).get(eventName);
			if (lifecycle) {
				callInitFn(instance, lifecycle, listener, {eventName, set});
			}
		}

		return {hasSet: true, changed: !alreadyListening};
	}

	const set = getListeners(instance, eventName);
	if (!set) {
		return {hasSet: false, changed: false};
	}

	const removed = set.delete(listener);
	if (set.size === 0) {
		eventsMap.get(instance).delete(eventName);

		const lifecycle = lifecycleMap.get(instance).get(eventName);
		if (swallowLifecycleError) {
			try {
				callAndUnsetDeinitFn(lifecycle);
			} catch {}
		} else {
			callAndUnsetDeinitFn(lifecycle);
		}

		if (removeResubscribedListener) {
			// Deinit can re-subscribe the same listener; keep rollback authoritative.
			const setAfterDeinit = getListeners(instance, eventName);
			setAfterDeinit?.delete(listener);
			if (setAfterDeinit?.size === 0) {
				eventsMap.get(instance).delete(eventName);
			}
		}
	}

	return {hasSet: true, changed: removed};
}

function emitSubscriptionSideEffects(instance, {eventName, listener, action, swallowErrors = false}) {
	const isSubscribe = action === subscribeAction;
	const debugType = isSubscribe ? 'subscribe' : 'unsubscribe';
	const metaEvent = isSubscribe ? listenerAdded : listenerRemoved;

	if (swallowErrors) {
		try {
			instance.logIfDebugEnabled(debugType, eventName, undefined);
		} catch {}

		if (!isMetaEvent(eventName)) {
			try {
				emitMetaEvent(instance, metaEvent, {eventName, listener});
			} catch {}
		}

		return;
	}

	instance.logIfDebugEnabled(debugType, eventName, undefined);

	if (!isMetaEvent(eventName)) {
		emitMetaEvent(instance, metaEvent, {eventName, listener});
	}
}

function rollbackAddedListeners(instance, eventNames, listener) {
	withSuppressedEnqueue(instance, eventNames, () => {
		for (const eventName of eventNames) {
			const {hasSet} = transitionEventListener(instance, {
				eventName,
				listener,
				action: unsubscribeAction,
				swallowLifecycleError: true,
				removeResubscribedListener: true,
			});
			if (!hasSet) {
				continue;
			}

			emitSubscriptionSideEffects(instance, {
				eventName,
				listener,
				action: unsubscribeAction,
				swallowErrors: true,
			});
		}
	});
}

function finishAndClearProducers(instance, eventName) {
	const producers = getEventProducers(instance, eventName);
	if (producers) {
		for (const producer of producers) {
			producer.finish();
		}

		producers.clear();
	}
}

function finishAndClearAllProducers(instance) {
	const allProducers = producersMap.get(instance);
	for (const [key, producers] of allProducers.entries()) {
		for (const producer of producers) {
			producer.finish();
		}

		producers.clear();
		allProducers.delete(key);
	}
}

const makeEventObject = (eventName, eventData, hasEventData) =>
	hasEventData ? {name: eventName, data: eventData} : {name: eventName};

function emitMetaEvent(emitter, eventName, eventData) {
	metaEventsAllowed.set(emitter, (metaEventsAllowed.get(emitter) ?? 0) + 1);
	metaEventsPermitted.set(emitter, (metaEventsPermitted.get(emitter) ?? 0) + 1);
	try {
		Emittery.prototype.emit.call(emitter, eventName, eventData);
	} finally {
		metaEventsAllowed.set(emitter, (metaEventsAllowed.get(emitter) ?? 0) - 1);
	}
}

export default class Emittery {
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
		anyMap.set(this, new Set());
		eventsMap.set(this, new Map());
		producersMap.set(this, new Map());
		lifecycleMap.set(this, new Map());

		producersMap.get(this).set(anyProducer, new Set());

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

	logIfDebugEnabled(type, eventName, eventData) {
		if (Emittery.isDebugEnabled || this.debug.enabled) {
			this.debug.logger(type, this.debug.name, eventName, eventData);
		}
	}

	on(eventNames, listener, {signal} = {}) {
		assertListener(listener);

		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		const addedEventNames = [];
		try {
			for (const eventName of eventNames) {
				assertEventName(eventName);
				const {changed} = transitionEventListener(this, {
					eventName,
					listener,
					action: subscribeAction,
				});
				if (changed) {
					addedEventNames.push(eventName);
				}

				emitSubscriptionSideEffects(this, {
					eventName,
					listener,
					action: subscribeAction,
				});
			}
		} catch (error) {
			rollbackAddedListeners(this, addedEventNames, listener);
			throw error;
		}

		let removeAbortListener = () => {};
		const noError = Symbol('no-error');
		const off = () => {
			removeAbortListener();
			let firstError = noError;

			for (const eventName of eventNames) {
				try {
					this.off(eventName, listener);
				} catch (error) {
					firstError = firstError === noError ? error : firstError;
				}
			}

			if (firstError !== noError) {
				throw firstError;
			}
		};

		removeAbortListener = addAbortListener(signal, off, {swallowErrors: true});

		return makeDisposable(off);
	}

	off(eventNames, listener) {
		assertListener(listener);

		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		for (const eventName of eventNames) {
			assertEventName(eventName);
			transitionEventListener(this, {
				eventName,
				listener,
				action: unsubscribeAction,
			});
			emitSubscriptionSideEffects(this, {
				eventName,
				listener,
				action: unsubscribeAction,
			});
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
				const noError = Symbol('no-error');
				let firstError = noError;

				for (const eventName of eventNames) {
					try {
						this.off(eventName, listener);
					} catch (error) {
						firstError = firstError === noError ? error : firstError;
					}
				}

				if (firstError !== noError) {
					throw firstError;
				}
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

		return iterator(this, eventNames, {signal});
	}

	async emit(eventName, eventData) {
		assertEventName(eventName);

		if (isMetaEvent(eventName)) {
			const remainingPermits = metaEventsPermitted.get(this) ?? 0;
			if ((metaEventsAllowed.get(this) ?? 0) === 0 || remainingPermits === 0) {
				throw new TypeError('`eventName` cannot be meta event `listenerAdded` or `listenerRemoved`');
			}

			metaEventsPermitted.set(this, remainingPermits - 1);
		}

		if (!isMetaEvent(eventName)) {
			this.logIfDebugEnabled('emit', eventName, eventData);
		}

		const hasEventData = arguments.length > 1;

		enqueueProducers(this, eventName, eventData, hasEventData);

		const listeners = getListeners(this, eventName) ?? new Set();
		const anyListeners = anyMap.get(this);
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

		if (isMetaEvent(eventName)) {
			const remainingPermits = metaEventsPermitted.get(this) ?? 0;
			if ((metaEventsAllowed.get(this) ?? 0) === 0 || remainingPermits === 0) {
				throw new TypeError('`eventName` cannot be meta event `listenerAdded` or `listenerRemoved`');
			}

			metaEventsPermitted.set(this, remainingPermits - 1);
		}

		if (!isMetaEvent(eventName)) {
			this.logIfDebugEnabled('emitSerial', eventName, eventData);
		}

		const hasEventData = arguments.length > 1;

		enqueueProducers(this, eventName, eventData, hasEventData);

		const listeners = getListeners(this, eventName) ?? new Set();
		const anyListeners = anyMap.get(this);
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

		this.logIfDebugEnabled('subscribeAny', undefined, undefined);

		anyMap.get(this).add(listener);
		emitMetaEvent(this, listenerAdded, {listener});

		let removeAbortListener = () => {};
		const offAny = () => {
			removeAbortListener();
			this.offAny(listener);
		};

		removeAbortListener = addAbortListener(signal, offAny, {swallowErrors: true});

		return makeDisposable(offAny);
	}

	anyEvent({signal} = {}) {
		return iterator(this, undefined, {signal});
	}

	offAny(listener) {
		assertListener(listener);

		this.logIfDebugEnabled('unsubscribeAny', undefined, undefined);

		emitMetaEvent(this, listenerRemoved, {listener});
		anyMap.get(this).delete(listener);
	}

	clearListeners(eventNames) {
		eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];
		const shouldClearAll = eventNames.some(eventName => !isEventKeyType(eventName));

		withSuppressedEnqueue(this, eventNames, () => {
			const noError = Symbol('no-error');
			let firstError = noError;

			try {
				for (const eventName of eventNames) {
					try {
						this.logIfDebugEnabled('clear', eventName, undefined);
					} catch (error) {
						firstError = firstError === noError ? error : firstError;
					}

					if (isEventKeyType(eventName)) {
						const set = getListeners(this, eventName);
						const hadListeners = set?.size > 0;
						set?.clear();
						finishAndClearProducers(this, eventName);

						const lifecycle = hadListeners ? lifecycleMap.get(this).get(eventName) : undefined;
						try {
							callAndUnsetDeinitFn(lifecycle);
						} catch (error) {
							firstError = firstError === noError ? error : firstError;
						}
					} else {
						anyMap.get(this).clear();
						finishAndClearAllProducers(this);

						for (const [eventName, listeners] of eventsMap.get(this).entries()) {
							const hadListeners = listeners.size > 0;
							listeners.clear();

							const lifecycle = hadListeners ? lifecycleMap.get(this).get(eventName) : undefined;
							try {
								callAndUnsetDeinitFn(lifecycle);
							} catch (error) {
								firstError = firstError === noError ? error : firstError;
							}

							// Re-clear in case deinit re-subscribed.
							listeners.clear();
							eventsMap.get(this).delete(eventName);
						}

						// Re-clear in case deinit re-subscribed to onAny() or created new iterators.
						anyMap.get(this).clear();
						finishAndClearAllProducers(this);
					}
				}
			} finally {
				if (shouldClearAll) {
					anyMap.get(this).clear();
					for (const listeners of eventsMap.get(this).values()) {
						listeners.clear();
					}

					eventsMap.get(this).clear();
					finishAndClearAllProducers(this);
				} else {
					// Final re-clear for cross-event deinit re-subscription (e.g., deinit for B re-subscribes to A).
					for (const eventName of eventNames) {
						if (isEventKeyType(eventName)) {
							const set = getListeners(this, eventName);
							set?.clear();
							eventsMap.get(this).delete(eventName);
							finishAndClearProducers(this, eventName);
						}
					}
				}
			}

			if (firstError !== noError) {
				throw firstError;
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

		const lifecycles = lifecycleMap.get(this);

		if (lifecycles.has(eventName)) {
			throw new Error('`eventName` already has an init function registered');
		}

		const lifecycle = {initFn, deinitFn: undefined};
		lifecycles.set(eventName, lifecycle);

		// If listeners already exist, call init immediately
		const existingListeners = getListeners(this, eventName);
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
				count += anyMap.get(this).size
					+ (getListeners(this, eventName)?.size ?? 0)
					+ (getEventProducers(this, eventName)?.size ?? 0)
					+ (getEventProducers(this)?.size ?? 0);

				continue;
			}

			if (eventName !== undefined) {
				assertEventName(eventName);
			}

			count += anyMap.get(this).size;

			for (const value of eventsMap.get(this).values()) {
				count += value.size;
			}

			for (const value of producersMap.get(this).values()) {
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
