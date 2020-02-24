# <img src="media/header.png" width="1000">

> Simple and modern async event emitter

[![Build Status](https://travis-ci.org/sindresorhus/emittery.svg?branch=master)](https://travis-ci.org/sindresorhus/emittery) [![codecov](https://codecov.io/gh/sindresorhus/emittery/branch/master/graph/badge.svg)](https://codecov.io/gh/sindresorhus/emittery) [![](https://badgen.net/bundlephobia/minzip/emittery)](https://bundlephobia.com/result?p=emittery)

It works in Node.js and the browser (using a bundler).

Emitting events asynchronously is important for production code where you want the least amount of synchronous operations. Since JavaScript is single-threaded, no other code can run while doing synchronous operations. For Node.js, that means it will block other requests, defeating the strength of the platform, which is scalability through async. In the browser, a synchronous operation could potentially cause lags and block user interaction.


## Install

```
$ npm install emittery
```


## Usage

```js
const Emittery = require('emittery');

const emitter = new Emittery();

emitter.on('🦄', data => {
	console.log(data);
});

const myUnicorn = Symbol('🦄');

emitter.on(myUnicorn, data => {
	console.log(`Unicorns love ${data}`);
});

emitter.emit('🦄', '🌈'); // Will trigger printing '🌈'
emitter.emit(myUnicorn, '🦋');  // Will trigger printing 'Unicorns love 🦋'

```


## API

### eventName

Emittery accepts strings and symbols as event names.
Symbol event names can be used to avoid name collisions when your classes are extended, especially for internal events.

### emitter = new Emittery()

#### on(eventName, listener)

Subscribe to an event.

Returns an unsubscribe method.

Using the same listener multiple times for the same event will result in only one method call per emitted event.

##### listener(data)

#### off(eventName, listener)

Remove an event subscription.

##### listener(data)

#### once(eventName)

Subscribe to an event only once. It will be unsubscribed after the first event.

Returns a promise for the event data when `eventName` is emitted.

```js
const Emittery = require('emittery');

const emitter = new Emittery();

emitter.once('🦄').then(data => {
	console.log(data);
	//=> '🌈'
});

emitter.emit('🦄', '🌈');
```

#### events(eventName)

Get an async iterator which buffers data each time an event is emitted.

Call `return()` on the iterator to remove the subscription.

```js
const Emittery = require('emittery');

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

In practice, you would usually consume the events using the [for await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) statement. In that case, to revoke the subscription simply break the loop.

```js
const Emittery = require('emittery');

const emitter = new Emittery();
const iterator = emitter.events('🦄');

emitter.emit('🦄', '🌈1'); // Buffered
emitter.emit('🦄', '🌈2'); // Buffered

// In an async context.
for await (const data of iterator) {
	if (data === '🌈2') {
		break; // Revoke the subscription when we see the value '🌈2'.
	}
}
```

#### emit(eventName, data?)

Trigger an event asynchronously, optionally with some data. Listeners are called in the order they were added, but executed concurrently.

Returns a promise that resolves when all the event listeners are done. *Done* meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.

#### emitSerial(eventName, data?)

Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other. Although ideally they should not. Prefer `emit()` whenever possible.

If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will *not* be called.

#### onAny(listener)

Subscribe to be notified about any event.

Returns a method to unsubscribe.

##### listener(eventName, data)

#### offAny(listener)

Remove an `onAny` subscription.

#### anyEvent()

Get an async iterator which buffers a tuple of an event name and data each time an event is emitted.

Call `return()` on the iterator to remove the subscription.

```js
const Emittery = require('emittery');

const emitter = new Emittery();
const iterator = emitter.anyEvent();

emitter.emit('🦄', '🌈1'); // Buffered
emitter.emit('🌟', '🌈2'); // Buffered

iterator.next()
	.then(({value, done}) => {
		// done === false
		// value is ['🦄', '🌈1']
		return iterator.next();
	})
	.then(({value, done}) => {
		// done === false
		// value is ['🌟', '🌈2']
		// Revoke subscription
		return iterator.return();
	})
	.then(({done}) => {
		// done === true
	});
```

In the same way as for `events`, you can subscribe by using the `for await` statement

#### clearListeners()

Clear all event listeners on the instance.

If `eventName` is given, only the listeners for that event are cleared.

#### listenerCount(eventName?)

The number of listeners for the `eventName` or all events if not specified.

#### bindMethods(target, methodNames?)

Bind the given `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the `target` object.

```js
import Emittery = require('emittery');

const object = {};

new Emittery().bindMethods(object);

object.emit('event');
```


## TypeScript

The default `Emittery` class does not let you type allowed event names and their associated data. However, you can use `Emittery.Typed` with generics:

```ts
import Emittery = require('emittery');

const emitter = new Emittery.Typed<{value: string}, 'open' | 'close'>();

emitter.emit('open');
emitter.emit('value', 'foo\n');
emitter.emit('value', 1); // TS compilation error
emitter.emit('end'); // TS compilation error
```

### Emittery.mixin(emitteryPropertyName, methodNames?)

A decorator which mixins `Emittery` as property `emitteryPropertyName` and `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the target class.

```ts
import Emittery = require('emittery');

@Emittery.mixin('emittery')
class MyClass {}

const instance = new MyClass();

instance.emit('event');
```


## Scheduling details

Listeners are not invoked for events emitted *before* the listener was added. Removing a listener will prevent that listener from being invoked, even if events are in the process of being (asynchronously!) emitted. This also applies to `.clearListeners()`, which removes all listeners. Listeners will be called in the order they were added. So-called *any* listeners are called *after* event-specific listeners.

Note that when using `.emitSerial()`, a slow listener will delay invocation of subsequent listeners. It's possible for newer events to overtake older ones.


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
emitter.on('🦄', ([foo, bar]) => {
	console.log(foo, bar);
});

emitter.emit('🦄', [foo, bar]);
```


## Related

- [p-event](https://github.com/sindresorhus/p-event) - Promisify an event by waiting for it to be emitted
