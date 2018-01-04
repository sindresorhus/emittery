#!/usr/bin/env node

'use strict';

const Emittery = require('../');

const myEmitter = new Emittery();

// Only accept one event data parameter
myEmitter.emit('event', {a: true, b: true}, 'not', 'supported');

// Does not provide a context either.
myEmitter.on('event', function ({a, b}, ...args) {
	console.log(a, b, args, this);
});

// Prints:
// 		true true [] undefined
