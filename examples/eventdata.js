#!/usr/bin/env node
import Emittery from '../index.js';

const myEmitter = new Emittery();

// Does not provide a context either.
myEmitter.on('event', function ({a, b}, ...arguments_) {
	console.log(a, b, arguments_, this);
});

// Only accept one event data parameter
myEmitter.emit('event', {a: true, b: true}, 'not', 'supported');

// Prints:
// 		true true [] undefined
