# <img src="media/header.png" width="1000">

> Simple and modern async event emitter

[![Build Status](https://travis-ci.org/sindresorhus/emittery.svg?branch=master)](https://travis-ci.org/sindresorhus/emittery) [![codecov](https://codecov.io/gh/sindresorhus/emittery/branch/master/graph/badge.svg)](https://codecov.io/gh/sindresorhus/emittery)

It's only ~200 bytes minified and gzipped. [I'm not fanatic about keeping the size at this level though.](https://github.com/sindresorhus/emittery/pull/5#issuecomment-347479211)

Emitting events asynchronously is important for production code where you want the least amount of synchronous operations.


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
	// '🌈'
});

emitter.emit('🦄', '🌈');
```

### Node.js 4 and 6

The above only works in Node.js 8 or newer. For older Node.js versions you can use `require('emittery/legacy')`.


## API

### emitter = new Emittery()

#### on(eventName, listener)

Subscribe to an event.

Returns an unsubscribe method.

Using the same listener multiple times for the same event will result in only one method call per emitted event.

##### listener(data)

#### off(eventName, [listener])

Unsubscribe to an event.

If you don't pass in a `listener`, it will remove all listeners for that event.

##### listener(data)

#### once(eventName)

Subscribe to an event only once. It will be unsubscribed after the first event.

Returns a promise for the event data when `eventName` is emitted.

```js
emitter.once('🦄').then(data => {
	console.log(data);
	//=> '🌈'
});

emitter.emit('🦄', '🌈');
```

#### emit(eventName, [data])

Trigger an event asynchronously, optionally with some data. Listeners are called in the order they were added, but execute concurrently.

Returns a promise for when all the event listeners are done. *Done* meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.

#### emitSerial(eventName, [data])

Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other. Although ideally they should not. Prefer `emit()` whenever possible.

If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will *not* be called.

#### onAny(listener)

Subscribe to be notified about any event.

Returns a method to unsubscribe.

##### listener(eventName, data)

#### offAny([listener])

Unsubscribe an `onAny` listener.

If you don't pass in a `listener`, it will remove all `onAny` listeners.

#### clear()

Clear all event listeners on the instance.

#### listenerCount([eventName])

The number of listeners for the `eventName` or all events if not specified.


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


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
