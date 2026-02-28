/**
Emittery accepts strings, symbols, and numbers as event names.

Symbol event names are preferred given that they can be used to avoid name collisions when your classes are extended, especially for internal events.
*/
export type EventName = PropertyKey;

/**
The object passed to every event listener. Always includes `name`. Includes `data` only when the event was emitted with data.

@example
```
import Emittery from 'emittery';

const emitter = new Emittery<{unicorn: string; close: undefined}>();

emitter.on('unicorn', ({name, data}) => {
	console.log(name); //=> 'unicorn'
	console.log(data); //=> '🌈'
});

emitter.on('close', ({name}) => {
	console.log(name); //=> 'close'
});
```
*/
export type EmitteryEvent<Name extends EventName, Data> = [Data] extends [undefined]
	? {readonly name: Name; readonly data?: undefined}
	: {readonly name: Name; readonly data: Data};

type EventDataPair<EventData, Name extends keyof EventData> = Name extends keyof EventData ? EmitteryEvent<Name, EventData[Name]> : never;

// Helper type for turning the passed `EventData` type map into a list of string keys that don't require data alongside the event name when emitting. Uses the same trick that `Omit` does internally to filter keys by building a map of keys to keys we want to keep, and then accessing all the keys to return just the list of keys we want to keep.
type DatalessEventNames<EventData> = {
	[Key in keyof EventData]: EventData[Key] extends undefined ? Key : never;
}[keyof EventData];

declare const listenerAdded: unique symbol;
declare const listenerRemoved: unique symbol;
type OmnipresentEventData = {[listenerAdded]: ListenerChangedData; [listenerRemoved]: ListenerChangedData};

/**
Emittery can collect and log debug information.

To enable this feature set the `DEBUG` environment variable to `emittery` or `*`. Additionally, you can set the static `isDebugEnabled` variable to true on the Emittery class, or `myEmitter.debug.enabled` on an instance of it for debugging a single instance.

See API for more information on how debugging works.
*/
export type DebugLogger<EventData, Name extends keyof EventData> = (type: string, debugName: string, eventName?: Name, eventData?: EventData[Name]) => void;

/**
Configure debug options of an instance.
*/
export type DebugOptions<EventData> = {
	/**
	Define a name for the instance of Emittery to use when outputting debug data.

	@default undefined

	@example
	```
	import Emittery from 'emittery';

	Emittery.isDebugEnabled = true;

	const emitter = new Emittery({debug: {name: 'myEmitter'}});

	emitter.on('test', () => {
		// …
	});

	emitter.emit('test');
	//=> [16:43:20.417][emittery:subscribe][myEmitter] Event Name: test
	//	data: undefined
	```
	*/
	readonly name: string;

	/**
	Toggle debug logging just for this instance.

	@default false

	@example
	```
	import Emittery from 'emittery';

	const emitter1 = new Emittery({debug: {name: 'emitter1', enabled: true}});
	const emitter2 = new Emittery({debug: {name: 'emitter2'}});

	emitter1.on('test', () => {
		// …
	});

	emitter2.on('test', () => {
		// …
	});

	emitter1.emit('test');
	//=> [16:43:20.417][emittery:subscribe][emitter1] Event Name: test
	//	data: undefined

	emitter2.emit('test');
	```
	*/
	readonly enabled?: boolean;

	/**
	Function that handles debug data.

	@default
	```
	(type, debugName, eventName, eventData) => {
		eventData = JSON.stringify(eventData);

		if (typeof eventName === 'symbol' || typeof eventName === 'number') {
			eventName = eventName.toString();
		}

		const currentTime = new Date();
		const logTime = `${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}.${currentTime.getMilliseconds()}`;
		console.log(`[${logTime}][emittery:${type}][${debugName}] Event Name: ${eventName}\n\tdata: ${eventData}`);
	}
	```

	@example
	```
	import Emittery from 'emittery';

	const myLogger = (type, debugName, eventName, eventData) => {
		console.log(`[${type}]: ${eventName}`);
	};

	const emitter = new Emittery({
		debug: {
			name: 'myEmitter',
			enabled: true,
			logger: myLogger
		}
	});

	emitter.on('test', () => {
		// …
	});

	emitter.emit('test');
	//=> [subscribe]: test
	```
	*/
	readonly logger?: DebugLogger<EventData, keyof EventData>;
};

/**
Configuration options for Emittery.
*/
export type Options<EventData> = {
	readonly debug?: DebugOptions<EventData>;
};

/**
A promise returned from `emittery.once` with an extra `off` method to cancel your subscription.
*/
export type EmitteryOncePromise<T> = {
	off(): void;
} & Promise<T>;

/**
Removes an event subscription.
*/
export type UnsubscribeFunction = () => void;

/**
The data provided as `eventData` when listening for `Emittery.listenerAdded` or `Emittery.listenerRemoved`.
*/
export type ListenerChangedData = {
	/**
	The listener that was added or removed.
	*/
	listener: (event: unknown) => (void | Promise<void>);

	/**
	The name of the event that was added or removed if `.on()` or `.off()` was used, or `undefined` if `.onAny()` or `.offAny()` was used.
	*/
	eventName?: EventName;
};

/**
Emittery is a strictly typed, fully async EventEmitter implementation. Event listeners can be registered with `on` or `once`, and events can be emitted with `emit`.

`Emittery` has a generic `EventData` type that can be provided by users to strongly type the list of events and the data passed to the listeners for those events. Pass an interface of {[eventName]: undefined | <eventArg>}, with all the event names as the keys and the values as the type of the argument passed to listeners if there is one, or `undefined` if there isn't.

@example
```
import Emittery from 'emittery';

const emitter = new Emittery<
	// Pass `{[eventName: <string | symbol | number>]: undefined | <eventArg>}` as the first type argument for events that pass data to their listeners.
	// A value of `undefined` in this map means the event listeners should expect no data, and a type other than `undefined` means the listeners will receive one argument of that type.
	{
		open: string,
		close: undefined
	}
>();

// Typechecks just fine because the data type for the `open` event is `string`.
emitter.emit('open', 'foo\n');

// Typechecks just fine because `close` is present but points to undefined in the event data type map.
emitter.emit('close');

// TS compilation error because `1` isn't assignable to `string`.
emitter.emit('open', 1);

// TS compilation error because `other` isn't defined in the event data type map.
emitter.emit('other');
```
*/
export default class Emittery<
	EventData = Record<EventName, unknown>, AllEventData = EventData & OmnipresentEventData,
	DatalessEvents = DatalessEventNames<EventData>,
> {
	/**
	Toggle debug mode for all instances.

	Default: `true` if the `DEBUG` environment variable is set to `emittery` or `*`, otherwise `false`.

	@example
	```
	import Emittery from 'emittery';

	Emittery.isDebugEnabled = true;

	const emitter1 = new Emittery({debug: {name: 'myEmitter1'}});
	const emitter2 = new Emittery({debug: {name: 'myEmitter2'}});

	emitter1.on('test', () => {
		// …
	});

	emitter2.on('otherTest', () => {
		// …
	});

	emitter1.emit('test');
	//=> [16:43:20.417][emittery:subscribe][myEmitter1] Event Name: test
	//	data: undefined

	emitter2.emit('otherTest');
	//=> [16:43:20.417][emittery:subscribe][myEmitter2] Event Name: otherTest
	//	data: undefined
	```
	*/
	static isDebugEnabled: boolean;

	/**
	Fires when an event listener was added.

	An object with `listener` and `eventName` (if `on` or `off` was used) is provided as event data.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.on(Emittery.listenerAdded, ({data: {listener, eventName}}) => {
		console.log(listener);
		//=> ({data}) => {}

		console.log(eventName);
		//=> '🦄'
	});

	emitter.on('🦄', ({data}) => {
		// Handle data
	});
	```
	*/
	static readonly listenerAdded: typeof listenerAdded;

	/**
	Fires when an event listener was removed.

	An object with `listener` and `eventName` (if `on` or `off` was used) is provided as event data.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	const off = emitter.on('🦄', ({data}) => {
		// Handle data
	});

	emitter.on(Emittery.listenerRemoved, ({data: {listener, eventName}}) => {
		console.log(listener);
		//=> ({data}) => {}

		console.log(eventName);
		//=> '🦄'
	});

	off();
	```
	*/
	static readonly listenerRemoved: typeof listenerRemoved;

	/**
	In TypeScript, it returns a decorator which mixins `Emittery` as property `emitteryPropertyName` and `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the target class.

	@example
	```
	import Emittery from 'emittery';

	@Emittery.mixin('emittery')
	class MyClass {}

	const instance = new MyClass();

	instance.emit('event');
	```
	*/
	static mixin(
		emitteryPropertyName: string | symbol,
		methodNames?: readonly string[]
	): <T extends abstract new (...arguments_: readonly any[]) => any>(klass: T, context?: ClassDecoratorContext<T>) => T;

	/**
	Debugging options for the current instance.
	*/
	debug: DebugOptions<EventData>;

	/**
	Create a new Emittery instance with the specified options.

	@returns An instance of Emittery that you can use to listen for and emit events.
	*/
	constructor(options?: Options<EventData>);

	/**
	Subscribe to one or more events.

	Using the same listener multiple times for the same event will result in only one method call per emitted event.

	@returns An unsubscribe method.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.on('🦄', ({data}) => {
		console.log(data);
	});

	emitter.on(['🦄', '🐶'], ({name, data}) => {
		console.log(name, data);
	});

	emitter.emit('🦄', '🌈'); // log => '🌈' and '🦄 🌈'
	emitter.emit('🐶', '🍖'); // log => '🐶 🍖'
	```
	*/
	on<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		listener: (event: EventDataPair<AllEventData, Name>) => void | Promise<void>,
		options?: {signal?: AbortSignal}
	): UnsubscribeFunction;

	/**
	Get an async iterator which buffers data each time an event is emitted.

	Call `return()` on the iterator to remove the subscription.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🦄', '🌈2'); // Buffered

	iterator
		.next()
		.then(({value, done}) => {
			// done === false
			// value === {name: '🦄', data: '🌈1'}
			return iterator.next();
		})
		.then(({value, done}) => {
			// done === false
			// value === {name: '🦄', data: '🌈2'}
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
	import Emittery from 'emittery';

	const emitter = new Emittery();
	const iterator = emitter.events('🦄');

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🦄', '🌈2'); // Buffered

	// In an async context.
	for await (const {data} of iterator) {
		if (data === '🌈2') {
			break; // Revoke the subscription when we see the value `🌈2`.
		}
	}
	```

	It accepts multiple event names.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();
	const iterator = emitter.events(['🦄', '🦊']);

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🦊', '🌈2'); // Buffered

	iterator
		.next()
		.then(({value, done}) => {
			// done === false
			// value === {name: '🦄', data: '🌈1'}
			return iterator.next();
		})
		.then(({value, done}) => {
			// done === false
			// value === {name: '🦊', data: '🌈2'}
			// Revoke subscription
			return iterator.return();
		})
		.then(({done}) => {
			// done === true
		});
	```
	*/
	events<Name extends keyof EventData>(
		eventName: Name | readonly Name[]
	): AsyncIterableIterator<EventDataPair<EventData, Name>>;

	/**
	Remove one or more event subscriptions.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	const listener = ({data}) => {
		console.log(data);
	};

	emitter.on(['🦄', '🐶', '🦊'], listener);
	await emitter.emit('🦄', 'a');
	await emitter.emit('🐶', 'b');
	await emitter.emit('🦊', 'c');
	emitter.off('🦄', listener);
	emitter.off(['🐶', '🦊'], listener);
	await emitter.emit('🦄', 'a'); // nothing happens
	await emitter.emit('🐶', 'b'); // nothing happens
	await emitter.emit('🦊', 'c'); // nothing happens
	```
	*/
	off<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		listener: (event: EventDataPair<AllEventData, Name>) => void | Promise<void>
	): void;

	/**
	Subscribe to one or more events only once. It will be unsubscribed after the first event that matches the predicate (if provided).

	@param eventName - The event name(s) to subscribe to.
	@param predicate - Optional predicate function to filter event data. The event will only be emitted if the predicate returns true.

	@returns The promise of event data when `eventName` is emitted and predicate matches (if provided). This promise is extended with an `off` method.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.once('🦄').then(({data}) => {
		console.log(data);
		//=> '🌈'
	});

	emitter.once(['🦄', '🐶']).then(({name, data}) => {
		console.log(name, data);
	});

	// With predicate
	emitter.once('data', ({data}) => data.ok === true).then(({data}) => {
		console.log(data);
		//=> {ok: true, value: 42}
	});

	emitter.emit('🦄', '🌈'); // Logs '🌈', then '🦄 🌈'
	emitter.emit('🐶', '🍖'); // Nothing happens
	emitter.emit('data', {ok: false}); // Nothing happens
	emitter.emit('data', {ok: true, value: 42}); // Logs {ok: true, value: 42}
	```
	*/
	once<Name extends keyof AllEventData>(eventName: Name | readonly Name[], predicate?: (event: EventDataPair<AllEventData, Name>) => boolean): EmitteryOncePromise<EventDataPair<AllEventData, Name>>;

	/**
	Trigger an event asynchronously, optionally with some data. Listeners are called in the order they were added, but executed concurrently.

	@returns A promise that resolves when all the event listeners are done. *Done* meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any listeners throw/reject, the returned promise rejects with an `AggregateError` — all listener errors are collected in `error.errors`, so no errors are silently lost. All listeners always run to completion, even if some throw or reject.
	*/
	emit<Name extends DatalessEvents>(eventName: Name): Promise<void>;
	emit<Name extends keyof EventData>(
		eventName: Name,
		eventData: EventData[Name]
	): Promise<void>;

	/**
	Same as `emit()`, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other. Although ideally they should not. Prefer `emit()` whenever possible.

	If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will *not* be called.

	@returns A promise that resolves when all the event listeners are done.
	*/
	emitSerial<Name extends DatalessEvents>(eventName: Name): Promise<void>;
	emitSerial<Name extends keyof EventData>(
		eventName: Name,
		eventData: EventData[Name]
	): Promise<void>;

	/**
	Subscribe to be notified about any event.

	@returns A method to unsubscribe.
	*/
	onAny(
		listener: (event: EventDataPair<EventData, keyof EventData>) => void | Promise<void>,
		options?: {signal?: AbortSignal}
	): UnsubscribeFunction;

	/**
	Get an async iterator which buffers an event object each time an event is emitted.

	Call `return()` on the iterator to remove the subscription.

	In the same way as for `events`, you can subscribe by using the `for await` statement.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();
	const iterator = emitter.anyEvent();

	emitter.emit('🦄', '🌈1'); // Buffered
	emitter.emit('🌟', '🌈2'); // Buffered

	iterator.next()
		.then(({value, done}) => {
			// done is false
			// value is {name: '🦄', data: '🌈1'}
			return iterator.next();
		})
		.then(({value, done}) => {
			// done is false
			// value is {name: '🌟', data: '🌈2'}
			// revoke subscription
			return iterator.return();
		})
		.then(({done}) => {
			// done is true
		});
	```
	*/
	anyEvent(): AsyncIterableIterator<EventDataPair<EventData, keyof EventData>>;

	/**
	Remove an `onAny` subscription.
	*/
	offAny(
		listener: (event: EventDataPair<EventData, keyof EventData>) => void | Promise<void>
	): void;

	/**
	Clear all event listeners on the instance.

	If `eventNames` is given, only the listeners for those events are cleared.
	*/
	clearListeners<Name extends keyof EventData>(eventName?: Name | readonly Name[]): void;

	/**
	Register a function to be called when the first `.on()` listener subscribes to `eventName`. The `initFn` can optionally return a cleanup (deinit) function, which is called when the last `.on()` listener unsubscribes (or when `clearListeners()` removes all listeners for that event).

	If `.on()` listeners already exist when `init()` is called, `initFn` is called immediately.

	Note: Lifecycle hooks only apply to `.on()` listeners. Subscriptions via `.events()` async iterators do not trigger the init or deinit functions.

	@returns An unsubscribe function. Calling it removes the init/deinit hooks, and if the init is currently active, it calls deinit immediately.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.init('mouse', () => {
		terminal.grabInput({mouse: 'button'});

		terminal.on('mouse', (name, data) => {
			emitter.emit('mouse', data);
		});

		return () => {
			terminal.releaseInput();
		};
	});

	// Init is called when the first listener subscribes
	const off = emitter.on('mouse', handler);

	// Adding more listeners does not call init again
	emitter.on('mouse', anotherHandler);

	// Removing one listener does not call deinit yet
	off();

	// Deinit is called when the last listener unsubscribes
	emitter.off('mouse', anotherHandler);
	```
	*/
	init<Name extends keyof EventData>(
		eventName: Name,
		initFn: () => (() => void) | void
	): UnsubscribeFunction;

	/**
	The number of listeners for the `eventName` or all events if not specified.
	*/
	listenerCount<Name extends keyof EventData>(eventName?: Name | readonly Name[]): number;

	/**
	Bind the given `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the `target` object.

	@example
	```
	import Emittery from 'emittery';

	const object = {};

	new Emittery().bindMethods(object);

	object.emit('event');
	```
	*/
	bindMethods(target: Record<string, unknown>, methodNames?: readonly string[]): void;
}
