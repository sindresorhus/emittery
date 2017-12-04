#!/usr/bin/env node

'use strict';

const Emittery = require('../');

class MyEmitter extends Emittery {}

const myEmitter = new MyEmitter();

// Emit events in next tick
myEmitter.emit('event', 1);
myEmitter.emit('event', 2);

// Register listener for only the one event
myEmitter.once('event')
	.then(count => console.log('an event occurred (#%d).', count));

// Prints:
//		an event occurred (#1).
