#!/usr/bin/env node

'use strict';

const Emittery = require('../');

class Clock extends Emittery {

	constructor(tick = 1000) {
		super();

		this._startedAt = 0;
		this._tick = tick > 0 ? tick : 1000;
		this._timer = null;
	}

	async tick() {
		if (this._timer === null) {
			await this.emit('error', new Error('not started'));
			this.stop();
			return;
		}

		const now = Date.now();
		const duration = now - this._startedAt;

		return this.emit('tick', {now, duration});
	}

	start() {
		this._startedAt = Date.now();
		this._timer = setInterval(this.tick.bind(this), this._tick);
		this.emit('started', null);
	}

	stop() {
		if (this._timer !== null) {
			clearInterval(this._timer);
		}

		this._timer = null;
		this._startedAt = 0;
		this.emit('stopped', null);
	}
}

const timer = new Clock();
const offTick = timer.on('tick', onTick);
const offError = timer.on('error', onError);

timer.start();

function onTick({duration}) {
	console.log(Math.floor(duration / 1000));

	if (duration > 5999) {
		stop();
	}
}

function onError(err) {
	stop();
	console.error(err);
	process.exit(1);
}

function stop() {
	offTick();
	offError();
	timer.stop();
}

// Prints:
// 		1
// 		2
// 		3
// 		4
// 		5
// 		6
