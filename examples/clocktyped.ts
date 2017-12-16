#!/usr/bin/env ts-node
import _Emittery = require('../');

// Alias Emittery class to use mapped event types
const Emittery = _Emittery as _Emittery.MappedCtor;

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
type EmptyEvents = 'started' | 'stopped';

class Clock extends Emittery<EventDataMap, EmptyEvents> {

	private _tick: number;
	private _timer: NodeJS.Timer | null;
	private _startedAt = 0;

	constructor(tick = 1000) {
		super();

		this._tick = tick > 0 ? tick : 1000;
		this._timer = null;
	}

	async tick(): Promise<void> {
		if (this._timer == null) {
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

		this.emit('started');
	}

	stop() {
		if (this._timer != null) {
			clearInterval(this._timer);
		}

		this._timer = null;
		this._startedAt = 0;

		this.emit('stopped');
	}

}

const timer = new Clock();
const offTick = timer.on('tick', onTick);
const offError = timer.on('error', onError);

timer.start();

function onTick({duration}: TickData) {
	console.log(Math.floor(duration/1000));

	if (duration > 5999) {
		stop();
	}
}

function onError(err: Error) {
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
