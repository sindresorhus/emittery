# <img src="media/header.png" width="1000">

> Simple and modern async event emitter

<!-- [![Coverage Status](https://codecov.io/gh/sindresorhus/emittery/branch/main/graph/badge.svg)](https://codecov.io/gh/sindresorhus/emittery) -->
[![](https://badgen.net/bundlephobia/minzip/emittery)](https://bundlephobia.com/result?p=emittery)

It works in Node.js and the browser (using a bundler).

Emitting events asynchronously is important for production code where you want the least amount of synchronous operations. Since JavaScript is single-threaded, no other code can run while doing synchronous operations. For Node.js, that means it will block other requests, defeating the strength of the platform, which is scalability through async. In the browser, a synchronous operation could potentially cause lags and block user interaction.

## Install

```sh
npm install emittery
```

## Usage

```js
import Emittery from 'emittery';

const emitter = new Emittery();

emitter.on('🦄', ({data}) => {
	console.log(data);
});

const myUnicorn = Symbol('🦄');

emitter.on(myUnicorn, ({data}) => {
	console.log(`Unicorns love ${data}`);
});

emitter.emit('🦄', '🌈'); // Will trigger printing '🌈'
emitter.emit(myUnicorn, '🦋');  // Will trigger printing 'Unicorns love 🦋'
```

## API

### eventName

Emittery accepts strings, symbols, and numbers as event names.

Symbol event names are preferred given that they can be used to avoid name collisions when your classes are extended, especially for internal events.

### isDebugEnabled

Toggle debug mode for all instances.

Default: `true` if the `DEBUG` environment variable is set to `emittery` or `*`, otherwise `false`.

Example:

```js
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

### emitter = new Emittery(options?)

Create a new instance of Emittery.

#### options?

Type: `object`

Configure the new instance of Emittery.

##### debug?

Type: `object`

Configure the debugging options for this instance.

###### name

Type: `string`\
Default: `undefined`

Define a name for the instance of Emittery to use when outputting debug data.

Example:

```js
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

###### enabled?

Type: `boolean`\
Default: `false`

Toggle debug logging just for this instance.

Example:

```js
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

###### logger?

Type: `Function(string, string, EventName?, Record<string, any>?) => void`

Default:

```js
(type, debugName, eventName, eventData) => {
	if (typeof eventData === 'object') {
		eventData = JSON.stringify(eventData);
	}

	if (typeof eventName === 'symbol' || typeof eventName === 'number') {
		eventName = eventName.toString();
	}

	const currentTime = new Date();
	const logTime = `${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}.${currentTime.getMilliseconds()}`;
	console.log(`[${logTime}][emittery:${type}][${debugName}] Event Name: ${eventName}\n\tdata: ${eventData}`);
}
```

Function that handles debug data.

Example:

```js
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

#### on(eventName | eventName[], listener, options?: {signal?: AbortSignal})

Subscribe to one or more events.

Returns an unsubscribe method.

Using the same listener multiple times for the same event will result in only one method call per emitted event.

```js
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

You can pass an [abort signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to unsubscribe too:

```js
import Emittery from 'emittery';

const abortController = new AbortController();

emitter.on('🐗', ({data}) => {
	console.log(data);
}, {signal: abortController.signal});

abortController.abort();
emitter.emit('🐗', '🍞'); // nothing happens
```

##### Custom subscribable events

Emittery exports some symbols which represent "meta" events that can be passed to `Emitter.on` and similar methods.

- `Emittery.listenerAdded` - Fires when an event listener was added.
- `Emittery.listenerRemoved` - Fires when an event listener was removed.

```js
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

###### Listener data

- `listener` - The listener that was added.
- `eventName` - The name of the event that was added or removed if `.on()` or `.off()` was used, or `undefined` if `.onAny()` or `.offAny()` was used.

Only events that are not of this type are able to trigger these events.

##### listener({name, data?})

#### off(eventName | eventName[], listener)

Remove one or more event subscriptions.

```js
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

##### listener({name, data?})

#### once(eventName | eventName[], predicate?)

Subscribe to one or more events only once. It will be unsubscribed after the first event that matches the predicate (if provided).

Returns a promise for the event data when `eventName` is emitted and predicate matches (if provided). This promise is extended with an `off` method.

```js
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
emitter.emit('data', {ok: true, value: 42}); // Log => {ok: true, value: 42}
```

#### events(eventName)

Get an async iterator which buffers data each time an event is emitted.

Call `return()` on the iterator to remove the subscription.

```js
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

In practice, you would usually consume the events using the [for await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) statement. In that case, to revoke the subscription simply break the loop.

```js
import Emittery from 'emittery';

const emitter = new Emittery();
const iterator = emitter.events('🦄');

emitter.emit('🦄', '🌈1'); // Buffered
emitter.emit('🦄', '🌈2'); // Buffered

// In an async context.
for await (const {data} of iterator) {
	if (data === '🌈2') {
		break; // Revoke the subscription when we see the value '🌈2'.
	}
}
```

It accepts multiple event names.

```js
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

#### emit(eventName, data?)

Trigger an event asynchronously, optionally with some data. Listeners are called in the order they were added, but executed concurrently.

Returns a promise that resolves when all the event listeners are done. *Done* meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any listeners throw/reject, the returned promise rejects with an `AggregateError` — all listener errors are collected in `error.errors`, so no errors are silently lost. All listeners always run to completion, even if some throw or reject.

#### emitSerial(eventName, data?)

Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other. Although ideally they should not. Prefer `emit()` whenever possible.

If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will *not* be called.

#### onAny(listener, options?: {signal?: AbortSignal})

Subscribe to be notified about any event.

Returns a method to unsubscribe. Abort signal is respected too.

##### listener({name, data?})

#### offAny(listener)

Remove an `onAny` subscription.

#### anyEvent()

Get an async iterator which buffers an event object each time an event is emitted.

Call `return()` on the iterator to remove the subscription.

```js
import Emittery from 'emittery';

const emitter = new Emittery();
const iterator = emitter.anyEvent();

emitter.emit('🦄', '🌈1'); // Buffered
emitter.emit('🌟', '🌈2'); // Buffered

iterator.next()
	.then(({value, done}) => {
		// done === false
		// value is {name: '🦄', data: '🌈1'}
		return iterator.next();
	})
	.then(({value, done}) => {
		// done === false
		// value is {name: '🌟', data: '🌈2'}
		// Revoke subscription
		return iterator.return();
	})
	.then(({done}) => {
		// done === true
	});
```

In the same way as for `events`, you can subscribe by using the `for await` statement

#### clearListeners(eventNames?)

Clear all event listeners on the instance.

If `eventNames` is given, only the listeners for those events are cleared.

#### init(eventName, initFn)

Register a function to be called when the first `.on()` listener subscribes to `eventName`. The `initFn` can optionally return a cleanup (deinit) function, which is called when the last `.on()` listener unsubscribes (or when `clearListeners()` removes all listeners for that event).

If `.on()` listeners already exist when `init()` is called, `initFn` is called immediately.

Returns an unsubscribe function. Calling it removes the init/deinit hooks, and if the init is currently active, it calls deinit immediately.

> [!NOTE]
> Lifecycle hooks only apply to `.on()` listeners. Subscriptions via `.events()` async iterators do not trigger the init or deinit functions.

```js
import Emittery from 'emittery';

const emitter = new Emittery();

emitter.init('mouse', () => {
	terminal.grabInput({mouse: 'button'});

	terminal.on('mouse', (name, data) => {
		emitter.emit('mouse', data);
	});

	// Optional: return cleanup (deinit) function
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

#### listenerCount(eventNames?)

The number of listeners for the `eventNames` or all events if not specified.

#### bindMethods(target, methodNames?)

Bind the given `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the `target` object.

```js
import Emittery from 'emittery';

const object = {};

new Emittery().bindMethods(object);

object.emit('event');
```

## TypeScript

The default `Emittery` class has generic types that can be provided by TypeScript users to strongly type the list of events and the data passed to their event listeners.

```ts
import Emittery from 'emittery';

const emitter = new Emittery<
	// Pass `{[eventName]: undefined | <eventArg>}` as the first type argument for events that pass data to their listeners.
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

### Emittery.mixin(emitteryPropertyName, methodNames?)

A decorator which mixins `Emittery` as property `emitteryPropertyName` and `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the target class.

```ts
import Emittery from 'emittery';

@Emittery.mixin('emittery')
class MyClass {}

const instance = new MyClass();

instance.emit('event');
```

## Scheduling details

Listeners are not invoked for events emitted *before* the listener was added. Removing a listener will prevent that listener from being invoked, even if events are in the process of being (asynchronously!) emitted. This also applies to `.clearListeners()`, which removes all listeners. Listeners will be called in the order they were added. So-called *any* listeners are called *after* event-specific listeners.

Listeners always fire asynchronously — they are deferred to the next microtask, so any synchronous code after an unawaited `emit()` call runs first. If ordering matters, use `await emit()`.

Note that when using `.emitSerial()`, a slow listener will delay invocation of subsequent listeners. It's possible for newer events to overtake older ones.

## Debugging

Emittery can collect and log debug information.

To enable this feature set the DEBUG environment variable to `'emittery'` or `'*'`. Additionally you can set the static `isDebugEnabled` variable to true on the Emittery class, or `myEmitter.debug.enabled` on an instance of it for debugging a single instance.

See [API](#api) for more details on how debugging works.

## FAQ

### How is this different than the built-in `EventEmitter` in Node.js?

There are many things to not like about `EventEmitter`: its huge API surface, synchronous event emitting, magic error event, flawed memory leak detection. Emittery has none of that.

### Isn't `EventEmitter` synchronous for a reason?

Mostly backwards compatibility reasons. The Node.js team can't break the whole ecosystem.

It also allows silly code like this:

```js
let unicorn = false;

emitter.on('🦄', () => {
	unicorn = true;
});

emitter.emit('🦄');

console.log(unicorn);
//=> true
```

But I would argue doing that shows a deeper lack of Node.js and async comprehension and is not something we should optimize for. The benefit of async emitting is much greater.

### Can you support multiple arguments for `emit()`?

No, just use [destructuring](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment):

```js
emitter.on('🦄', ({data: [foo, bar]}) => {
	console.log(foo, bar);
});

emitter.emit('🦄', [foo, bar]);
```

## Related

- [p-event](https://github.com/sindresorhus/p-event) - Promisify an event by waiting for it to be emitted
