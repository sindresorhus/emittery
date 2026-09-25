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

// The instance methods `Emittery.mixin()` can add to a class.
export type EmitteryMethodName = Exclude<keyof Emittery, 'debug'>;

// A mixed in class, so its instances also get the emittery property and the mixed in methods.
type MixedEmittery<
	T extends abstract new (...arguments_: readonly any[]) => any,
	PropertyName extends string | symbol,
	MethodNames extends readonly EmitteryMethodName[],
> = new (...arguments_: ConstructorParameters<T>) => InstanceType<T>
	& Pick<Emittery, MethodNames[number]>
	& Record<PropertyName, Emittery>;

// Helper type for turning the passed `EventData` type map into a list of string keys that don't require data alongside the event name when emitting. Uses the same trick that `Omit` does internally to filter keys by building a map of keys to keys we want to keep, and then accessing all the keys to return just the list of keys we want to keep.
type DatalessEventNames<EventData> = {
	// An `unknown` payload means "anything", so such events can also be emitted without data.
	[Key in keyof EventData]: unknown extends EventData[Key] ? Key : EventData[Key] extends undefined ? Key : never;
}[keyof EventData];

declare const listenerAdded: unique symbol;
declare const listenerRemoved: unique symbol;
type OmnipresentEventData = {[listenerAdded]: ListenerChangedData; [listenerRemoved]: ListenerChangedData};

/**
Emittery can collect and log debug information.

To enable this feature set the `DEBUG` environment variable to `emittery` or `*`. Additionally, you can set the static `isDebugEnabled` variable to true on the Emittery class, or `myEmitter.debug.enabled` on an instance of it for debugging a single instance.

See API for more information on how debugging works.
*/
export type DebugLogger<EventData, Name extends keyof EventData> = (type: string, debugName?: string, eventName?: Name, eventData?: EventData[Name]) => void;

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
	readonly name?: string;

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
		try {
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
An async iterator from `emittery.events()` or `emittery.anyEvent()`.

It is also {@link AsyncDisposable}, so it works with `await using`.
*/
// `AsyncIterableIterator` already declares `next()` and `return()` with a return type of `any`, and `[Symbol.asyncIterator]()` returning itself without being disposable, so they have to be omitted for the narrower ones below to win overload resolution.
export type EmitteryAsyncIterator<T> = Omit<AsyncIterableIterator<T>, 'next' | 'return' | typeof Symbol.asyncIterator> & AsyncDisposable & {
	next(): Promise<IteratorResult<T, undefined>>;
	// `return()` awaits its argument, so a thenable argument resolves to the value it holds.
	return<U = undefined>(value?: U | PromiseLike<U>): Promise<IteratorResult<T, Awaited<U>>>;
	[Symbol.asyncIterator](): EmitteryAsyncIterator<T>;
};

/**
Removes an event subscription.

Can be used with the `using` keyword for automatic cleanup:

@example
```
import Emittery from 'emittery';

const emitter = new Emittery();

{
	using off = emitter.on('event', ({data}) => {
		console.log(data);
	});
	// auto-unsubscribes when leaving scope
}
```
*/
export type UnsubscribeFunction = (() => void) & Disposable;

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

	It throws if the target's prototype already has a property with any of those names, inherited members included, or if `emitteryPropertyName` is also one of `methodNames`, since one prototype property cannot be both. A class field with the same name is not detected and silently shadows the mixin.

	@example
	```
	import Emittery from 'emittery';

	const MyClass = Emittery.mixin('emittery')(class {});

	const instance = new MyClass();

	instance.emit('event');
	```

	@example
	```
	// TypeScript cannot add the mixed in members to a decorated class declaration, so declare them with an interface.
	// Only do this when every method is mixed in. The interface cannot follow `methodNames`, and it compiles either way, so restricting the methods leaves the instance typed with methods it does not have.
	@Emittery.mixin('emittery')
	class MyClass {}

	interface MyClass extends Emittery {
		emittery: Emittery;
	}

	const instance = new MyClass();

	instance.emit('event');
	```
	*/
	static mixin<
		PropertyName extends string | symbol,
		MethodNames extends readonly EmitteryMethodName[] = readonly EmitteryMethodName[],
	>(
		// One prototype property cannot be both the emittery instance and a method that forwards to it, which `Emittery.mixin()` also rejects at runtime.
		emitteryPropertyName: PropertyName extends MethodNames[number] ? never : PropertyName,
		methodNames?: MethodNames
	): <T extends abstract new (...arguments_: readonly any[]) => any>(klass: T, context?: ClassDecoratorContext<T>) => T
		& MixedEmittery<T, PropertyName, MethodNames>;

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

	@returns An unsubscribe method, which is also {@link Disposable} (can be used with `using`).

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

	@example
	```
	// With AbortSignal
	const abortController = new AbortController();

	emitter.on('🐗', ({data}) => {
		console.log(data);
	}, {signal: abortController.signal});

	abortController.abort();
	```

	@example
	```
	// With `using` for automatic cleanup
	{
		using off = emitter.on('🦄', ({data}) => {
			console.log(data);
		});
		await emitter.emit('🦄', '🌈'); // Logs '🌈'
	}

	await emitter.emit('🦄', '🌈'); // Nothing happens
	```
	*/
	on<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		listener: (event: EventDataPair<AllEventData, Name>) => void | Promise<void>,
		options?: {signal?: AbortSignal}
	): UnsubscribeFunction;

	/**
	Get an async iterator which buffers data each time an event is emitted.

	Call `return()` on the iterator to remove the subscription. You can also pass an {@link AbortSignal} to cancel the subscription externally, or use `await using` for automatic cleanup.

	If the event data is a promise, the iterator waits for it. A promise that rejects throws from the iteration and closes the iterator, so a `for await` loop cannot leave the subscription behind.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	for await (const {data} of emitter.events('🦄')) {
		console.log(data);

		if (data === '🌈2') {
			break; // Revoke the subscription when we see the value '🌈2'.
		}
	}
	```

	@example
	```
	// With multiple event names
	for await (const {name, data} of emitter.events(['🦄', '🦊'])) {
		console.log(name, data);
	}
	```

	@example
	```
	// With `await using` for automatic cleanup
	{
		await using iterator = emitter.events('🦄');
		for await (const {data} of iterator) {
			console.log(data);
		}
	} // Subscription is automatically revoked
	```
	*/
	events<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		options?: {signal?: AbortSignal}
	): EmitteryAsyncIterator<EventDataPair<AllEventData, Name>>;

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
	await emitter.emit('🦄', 'a'); // Nothing happens
	await emitter.emit('🐶', 'b'); // Nothing happens
	await emitter.emit('🦊', 'c'); // Nothing happens
	```
	*/
	off<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		listener: (event: EventDataPair<AllEventData, Name>) => void | Promise<void>
	): void;

	/**
	Subscribe to one or more events only once. It will be unsubscribed after the first event that matches the predicate (if provided).

	The second argument can be a predicate function or an options object with `predicate` and/or `signal`.

	@returns The promise of event data when `eventName` is emitted and predicate matches (if provided). The promise has an `off` method to cancel the subscription.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	const {data} = await emitter.once('🦄');
	console.log(data);
	//=> '🌈'
	```

	@example
	```
	// With multiple event names
	const {name, data} = await emitter.once(['🦄', '🐶']);
	console.log(name, data);
	```

	@example
	```
	// With predicate
	const event = await emitter.once('data', ({data}) => data.ok === true);
	console.log(event.data);
	//=> {ok: true, value: 42}
	```

	@example
	```
	// With AbortSignal for timeout
	await emitter.once('ready', {signal: AbortSignal.timeout(5000)});
	```

	@example
	```
	// Cancel with .off()
	const promise = emitter.once('🦄');
	promise.off();
	```
	*/
	once<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		predicate?: (event: EventDataPair<AllEventData, Name>) => boolean
	): EmitteryOncePromise<EventDataPair<AllEventData, Name>>;
	once<Name extends keyof AllEventData>(
		eventName: Name | readonly Name[],
		options?: {
			predicate?: (event: EventDataPair<AllEventData, Name>) => boolean;
			signal?: AbortSignal;
		}
	): EmitteryOncePromise<EventDataPair<AllEventData, Name>>;

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

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.on('🦄', async () => {
		console.log('listener 1 start');
		await new Promise(resolve => setTimeout(resolve, 100));
		console.log('listener 1 done');
	});

	emitter.on('🦄', () => {
		console.log('listener 2'); // Only runs after listener 1 is done
	});

	await emitter.emitSerial('🦄');
	```
	*/
	emitSerial<Name extends DatalessEvents>(eventName: Name): Promise<void>;
	emitSerial<Name extends keyof EventData>(
		eventName: Name,
		eventData: EventData[Name]
	): Promise<void>;

	/**
	Subscribe to be notified about any event.

	@returns A method to unsubscribe, which is also {@link Disposable}.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	const off = emitter.onAny(({name, data}) => {
		console.log(name, data);
	});

	await emitter.emit('🦄', '🌈'); // log => '🦄 🌈'

	off();
	```
	*/
	onAny(
		listener: (event: EventDataPair<EventData, keyof EventData>) => void | Promise<void>,
		options?: {signal?: AbortSignal}
	): UnsubscribeFunction;

	/**
	Get an async iterator which buffers an event object each time an event is emitted.

	Call `return()` on the iterator to remove the subscription. You can also pass an {@link AbortSignal} to cancel the subscription externally, or use `await using` for automatic cleanup.

	If the event data is a promise, the iterator waits for it. A promise that rejects throws from the iteration and closes the iterator, so a `for await` loop cannot leave the subscription behind.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	for await (const {name, data} of emitter.anyEvent()) {
		console.log(name, data);
	}
	```

	@example
	```
	// With `await using` for automatic cleanup
	{
		await using iterator = emitter.anyEvent();
		for await (const {name, data} of iterator) {
			console.log(name, data);
		}
	} // Subscription is automatically revoked
	```
	*/
	anyEvent(options?: {signal?: AbortSignal}): EmitteryAsyncIterator<EventDataPair<EventData, keyof EventData>>;

	/**
	Remove an `onAny` subscription.
	*/
	offAny(
		listener: (event: EventDataPair<EventData, keyof EventData>) => void | Promise<void>
	): void;

	/**
	Clear all event listeners on the instance.

	If `eventNames` is given, only the listeners for those events are cleared. Accepts a single event name or an array.

	An `undefined` in the array means "everything", the same as calling it without arguments, and any other invalid event name throws a `TypeError` instead of clearing.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.on('🦄', listener);
	emitter.on('🐶', listener);

	emitter.clearListeners('🦄'); // Clear a single event
	emitter.clearListeners(['🐶', '🦊']); // Clear multiple events
	emitter.clearListeners(); // Clear all events
	```
	*/
	clearListeners<Name extends keyof AllEventData>(eventName?: Name | ReadonlyArray<Name | undefined>): void;

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

	@example
	```
	// With `using` for automatic cleanup of hooks
	{
		using removeInit = emitter.init('mouse', () => {
			startListening();
			return () => stopListening();
		});
	} // init/deinit hooks are automatically removed
	```
	*/
	init<Name extends keyof EventData>(
		eventName: Name,
		initFn: () => (() => void) | void
	): UnsubscribeFunction;

	/**
	The number of listeners for the `eventName` or all events if not specified.

	An `undefined` in the array means "everything", the same as calling it without arguments. Note that `onAny()` listeners and `events()` iterators are counted for every event name, so an array adds them up more than once.

	@example
	```
	import Emittery from 'emittery';

	const emitter = new Emittery();

	emitter.on('🦄', listener);
	emitter.on('🐶', listener);

	emitter.listenerCount('🦄'); // 1
	emitter.listenerCount(); // 2
	```
	*/
	listenerCount<Name extends keyof AllEventData>(eventName?: Name | ReadonlyArray<Name | undefined>): number;

	/**
	Log debug information if debug mode is enabled (either globally via `Emittery.isDebugEnabled` or per-instance via `debug.enabled`).
	*/
	logIfDebugEnabled<Name extends keyof AllEventData>(type: string, eventName?: Name, eventData?: AllEventData[Name]): void;

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
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- A `Record<string, unknown>` would reject class instances, which have no index signature.
	bindMethods(target: object, methodNames?: readonly EmitteryMethodName[]): void;
}
