#!/usr/bin/env npx ts-node
import {setInterval} from 'timers';
import Emittery = require('..');

interface TickData {
	now: number;
	duration: number;
}

// Map Clock's events emitting data to the type of their data.
type EventDataMap = {
	tick: TickData,
	error: Error
};

// List of event which do not required data
type EmptyEvents = 'start' | 'stop';

class Clock extends Emittery.Typed<EventDataMap, EmptyEvents> {
	private startedAt = 0;
	private timer: NodeJS.Timer | null = null;

	public constructor() {
		super();
	}

	private tick() {
		if (!this.timer) {
			this.emit('error', new Error('Clock has not been started'));
			return;
		}

		const now = Date.now();
		const duration = now - this.startedAt;

		this.emit('tick', {duration, now});
	}

	public start() {
		if (this.timer) {
			throw new Error('Clock has already been started');
		}

		this.startedAt = Date.now();
		this.timer = setInterval(this.tick.bind(this), 1000);

		this.emit('start');
	}

	public stop() {
		if (this.timer) {
			clearInterval(this.timer);
		}

		this.startedAt = 0;
		this.timer = null;

		this.emit('stop');
	}
}

function onTick({duration}: TickData) {
	console.log(Math.floor(duration / 1000));

	if (duration >= 6000) {
		stop();
	}
}

function onError(err: Error) {
	process.exitCode = 1;
	console.error(err);
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
