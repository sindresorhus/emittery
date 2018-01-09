#!/usr/bin/env node

'use strict';

const Emittery = require('..');

const myEmitter = new Emittery();

// Register listener for only the one event
myEmitter.once('event')
	.then(count => console.log('an event occurred (#%d).', count));

// Emit events in next tick
myEmitter.emit('event', 1);
myEmitter.emit('event', 2);

// Prints:
//		an event occurred (#1).
