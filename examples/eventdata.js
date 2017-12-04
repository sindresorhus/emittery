#!/usr/bin/env node

'use strict';

const Emittery = require('../');

class MyEmitter extends Emittery {}

const myEmitter = new MyEmitter();

// Only accept one event data parameter
myEmitter.emit('event', {a: true, b: true}, 'not', 'supported');

// Does not provide a context either.
myEmitter.on('event', function ({a, b}, ...args) {
	console.log(a, b, args, this);
});

// Prints:
// 		true true [] undefined
