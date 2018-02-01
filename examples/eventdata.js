#!/usr/bin/env node

'use strict';

const Emittery = require('..');

const myEmitter = new Emittery();

// Does not provide a context either.
myEmitter.on('event', function ({a, b}, ...args) {
	console.log(a, b, args, this);
});

// Only accept one event data parameter
myEmitter.emit('event', {a: true, b: true}, 'not', 'supported');

// Prints:
// 		true true [] undefined
