/**
Emittery accepts strings and symbols as event names.

Symbol event names can be used to avoid name collisions when your classes are extended, especially for internal events.
*/
type EventName = string | symbol;

declare class Emittery {
	/**
	In TypeScript, it returns a decorator which mixins `Emittery` as property `emitteryPropertyName` and `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the target class.

	@example
	```
	import Emittery = require('emittery');

	@Emittery.mixin('emittery')
	class MyClass {}

	const instance = new MyClass();

	instance.emit('event');
	```
	*/
	static mixin(emitteryPropertyName: string, methodNames?: readonly string[]): Function;

	/**
	Fires when an event listener was added.

	An object with `listener` and `eventName` (if `on` or `off` was used) is provided as event data.

	@example
	```
	import Emittery = require('emittery');

	const emitter = new Emittery();

	emitter.on(Emittery.listenerAdded, ({listener, eventName}) => {
		console.log(listener);
		//=> data => {}

		console.log(eventName);
		//=> '🦄'
	});

	emitter.on('🦄', data => {
		// Handle data
	});
	```
	*/
	static readonly listenerAdded: unique symbol;

	/**
	Fires when an event listener was removed.

	An object with `listener` and `eventName` (if `on` or `off` was used) is provided as event data.

	@example
	```
	import Emittery = require('emittery');

	const emitter = new Emittery();

	const off = emitter.on('🦄', data => {
		// Handle data
	});

	emitter.on(Emittery.listenerRemoved, ({listener, eventName}) => {
		console.log(listener);
		//=> data => {}

		console.log(eventName);
		//=> '🦄'
	});

	off();
	```
	*/
	static readonly listenerRemoved: unique symbol;

	/**
	Subscribe to an event.

	Using the same listener multiple times for the same event will result in only one method call per emitted event.

	@returns An unsubscribe method.
	*/
	on(eventName: typeof Emittery.listenerAdded | typeof Emittery.listenerRemoved, listener: (eventData: Emittery.ListenerChangedData) => void): Emittery.UnsubscribeFn
	on(eventName: EventName, listener: (eventData?: unknown) => void): Emittery.UnsubscribeFn;

	/**
	Get an async iterator which buffers data each time an event is emitted.

	Call `return()` on the iterator to remove the subscription.

	@example
	```
	import Emittery = require('emittery');

	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🦄', '🌈2'); // Buffered

	iterator
		.next()
		.then(({value, done}) => {
			// done === false
			// value === '🌈1'
			return iterator.next();
		})
		.then(({value, done}) => {
			// done === false
			// value === '🌈2'
			// Revoke subscription
			return iterator.return();
		})
		.then(({done}) => {
			// done === true
		});
	```

	In practice you would usually consume the events using the [for await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) statement. In that case, to revoke the subscription simply break the loop.

	@example
	```
	import Emittery = require('emittery');

	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🦄', '🌈2'); // Buffered

	// In an async context.
	for await (const data of iterator) {
		if (data === '🌈2') {
			break; // Revoke the subscription when we see the value `🌈2`.
		}
	}
	```
	*/
	events(eventName: EventName): AsyncIterableIterator<unknown>

	/**
	Remove an event subscription.
	*/
	off(eventName: EventName, listener: (eventData?: unknown) => void): void;

	/**
	Subscribe to an event only once. It will be unsubscribed after the first
	event.

	@returns The event data when `eventName` is emitted.
	*/
	once(eventName: typeof Emittery.listenerAdded | typeof Emittery.listenerRemoved): Promise<Emittery.ListenerChangedData>
	once(eventName: EventName): Promise<unknown>;

	/**
	Trigger an event asynchronously, optionally with some data. Listeners are called in the order they were added, but executed concurrently.

	@returns A promise that resolves when all the event listeners are done. *Done* meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
	*/
	emit(eventName: EventName, eventData?: unknown): Promise<void>;

	/**
	Same as `emit()`, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other. Although ideally they should not. Prefer `emit()` whenever possible.

	If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will *not* be called.

	@returns A promise that resolves when all the event listeners are done.
	*/
	emitSerial(eventName: EventName, eventData?: unknown): Promise<void>;

	/**
	Subscribe to be notified about any event.

	@returns A method to unsubscribe.
	*/
	onAny(listener: (eventName: EventName, eventData?: unknown) => unknown): Emittery.UnsubscribeFn;

	/**
	Get an async iterator which buffers a tuple of an event name and data each time an event is emitted.

	Call `return()` on the iterator to remove the subscription.

	In the same way as for `events`, you can subscribe by using the `for await` statement.

	@example
	```
	import Emittery = require('emittery');

	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🌟', '🌈2'); // Buffered

	iterator.next()
		.then(({value, done}) => {
			// done is false
			// value is ['🦄', '🌈1']
			return iterator.next();
		})
		.then(({value, done}) => {
			// done is false
			// value is ['🌟', '🌈2']
			// revoke subscription
			return iterator.return();
		})
		.then(({done}) => {
			// done is true
		});
	```
	*/
	anyEvent(): AsyncIterableIterator<unknown>

	/**
	Remove an `onAny` subscription.
	*/
	offAny(listener: (eventName: EventName, eventData?: unknown) => void): void;

	/**
	Clear all event listeners on the instance.

	If `eventName` is given, only the listeners for that event are cleared.
	*/
	clearListeners(eventName?: EventName): void;

	/**
	The number of listeners for the `eventName` or all events if not specified.
	*/
	listenerCount(eventName?: EventName): number;

	/**
	Bind the given `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the `target` object.

	@example
	```
	import Emittery = require('emittery');

	const object = {};

	new Emittery().bindMethods(object);

	object.emit('event');
	```
	*/
	bindMethods(target: object, methodNames?: readonly string[]): void;
}

declare namespace Emittery {
	/**
	Removes an event subscription.
	*/
	type UnsubscribeFn = () => void;
	type EventNameFromDataMap<EventDataMap> = Extract<keyof EventDataMap, EventName>;

	/**
	Maps event names to their emitted data type.
	*/
	interface Events {
		// Blocked by https://github.com/microsoft/TypeScript/issues/1863, should be
		// `[eventName: EventName]: unknown;`
	}

	/**
	The data provided as `eventData` when listening for `Emittery.listenerAdded` or `Emittery.listenerRemoved`.
	*/
	interface ListenerChangedData {
		/**
		The listener that was added or removed.
		*/
		listener: (eventData?: unknown) => void;

		/**
		The name of the event that was added or removed if `.on()` or `.off()` was used, or `undefined` if `.onAny()` or `.offAny()` was used.
		*/
		eventName?: EventName;
	}

	/**
	Async event emitter.

	You must list supported events and the data type they emit, if any.

	@example
	```
	import Emittery = require('emittery');

	const emitter = new Emittery.Typed<{value: string}, 'open' | 'close'>();

	emitter.emit('open');
	emitter.emit('value', 'foo\n');
	emitter.emit('value', 1); // TS compilation error
	emitter.emit('end'); // TS compilation error
	```
	*/
	class Typed<EventDataMap extends Events, EmptyEvents extends EventName = never> extends Emittery {
		on<Name extends EventNameFromDataMap<EventDataMap>>(eventName: Name, listener: (eventData: EventDataMap[Name]) => void): Emittery.UnsubscribeFn;
		on<Name extends EmptyEvents>(eventName: Name, listener: () => void): Emittery.UnsubscribeFn;

		events<Name extends EventNameFromDataMap<EventDataMap>>(eventName: Name): AsyncIterableIterator<EventDataMap[Name]>;

		once<Name extends EventNameFromDataMap<EventDataMap>>(eventName: Name): Promise<EventDataMap[Name]>;
		once<Name extends EmptyEvents>(eventName: Name): Promise<void>;

		off<Name extends EventNameFromDataMap<EventDataMap>>(eventName: Name, listener: (eventData: EventDataMap[Name]) => void): void;
		off<Name extends EmptyEvents>(eventName: Name, listener: () => void): void;

		onAny(listener: (eventName: EventNameFromDataMap<EventDataMap> | EmptyEvents, eventData?: EventDataMap[EventNameFromDataMap<EventDataMap>]) => void): Emittery.UnsubscribeFn;
		anyEvent(): AsyncIterableIterator<[EventNameFromDataMap<EventDataMap>, EventDataMap[EventNameFromDataMap<EventDataMap>]]>;

		offAny(listener: (eventName: EventNameFromDataMap<EventDataMap> | EmptyEvents, eventData?: EventDataMap[EventNameFromDataMap<EventDataMap>]) => void): void;

		emit<Name extends EventNameFromDataMap<EventDataMap>>(eventName: Name, eventData: EventDataMap[Name]): Promise<void>;
		emit<Name extends EmptyEvents>(eventName: Name): Promise<void>;

		emitSerial<Name extends EventNameFromDataMap<EventDataMap>>(eventName: Name, eventData: EventDataMap[Name]): Promise<void>;
		emitSerial<Name extends EmptyEvents>(eventName: Name): Promise<void>;
	}
}

export = Emittery;
