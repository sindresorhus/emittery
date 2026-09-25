#!/usr/bin/env node
import Emittery from '../index.js';

const myEmitter = new Emittery();

// Register listener
myEmitter.on('event', () => {
	console.log('an event occurred!');
});

myEmitter.onAny(({name}) => {
	console.log('`%s` event occurred!', name);
});

// Emit event in next tick
myEmitter.emit('event');

// Prints:
// 		an event occurred!
// 		`event` event occurred!
