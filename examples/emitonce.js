#!/usr/bin/env node
import Emittery from '../index.js';

const myEmitter = new Emittery();

// Register listener for only the one event
(async () => {
	console.log('An event occurred (#%d).', await myEmitter.once('event'));
})();

// Emit events in next tick
myEmitter.emit('event', 1);
myEmitter.emit('event', 2);

// Prints:
//		An event occurred (#1).
