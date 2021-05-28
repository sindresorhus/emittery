#!/usr/bin/env node
'use strict';

const Emittery = require('..');

class Clock extends Emittery {
	constructor() {
		super();
		this.startedAt = 0;
		this.timer = null;
	}

	tick() {
		if (!this.timer) {
			this.emit('error', new Error('Clock has not been started'));
			return;
		}

		const now = Date.now();
		const duration = now - this.startedAt;

		this.emit('tick', {duration, now});
	}

	start() {
		if (this.timer) {
			throw new Error('Clock has already been started');
		}

		this.startedAt = Date.now();
		this.timer = setInterval(this.tick.bind(this), 1000);

		this.emit('start');
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
		}

		this.startedAt = 0;
		this.timer = null;

		this.emit('stop');
	}
}

function onTick({duration}) {
	console.log(Math.floor(duration / 1000));

	if (duration >= 6000) {
		stop();
	}
}

function onError(error) {
	process.exitCode = 1;
	console.error(error);
	stop();
}

const timer = new Clock();
const offTick = timer.on('tick', onTick);
const offError = timer.on('error', onError);

function stop() {
	offTick();
	offError();
	timer.stop();
}

timer.start();
// Prints:
// 		1
// 		2
// 		3
// 		4
// 		5
// 		6
