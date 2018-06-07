export = Emittery;

declare class Emittery {
	/**
	 * Subscribe to an event.
	 *
	 * Returns an unsubscribe method.
	 *
	 * Using the same listener multiple times for the same event will result
	 * in only one method call per emitted event.
	 */
	on(eventName: string, listener: (eventData?: any) => any): Emittery.UnsubscribeFn;

	/**
	 * Remove an event subscription.
	 */
	off(eventName: string, listener: (eventData?: any) => any): void;

	/**
	 * Subscribe to an event only once. It will be unsubscribed after the first
	 * event.
	 *
	 * Returns a promise for the event data when `eventName` is emitted.
	 */
	once(eventName: string): Promise<any>;

	/**
	 * Trigger an event asynchronously, optionally with some data. Listeners
	 * are called in the order they were added, but execute concurrently.
	 *
	 * Returns a promise for when all the event listeners are done. *Done*
	 * meaning executed if synchronous or resolved when an
	 * async/promise-returning function. You usually wouldn't want to wait for
	 * this, but you could for example catch possible errors. If any of the
	 * listeners throw/reject, the returned promise will be rejected with the
	 * error, but the other listeners will not be affected.
	 *
	 * Returns a promise for when all the event listeners are done.
	 */
	emit(eventName: string, eventData?: any): Promise<void>;

	/**
	 * Same as `emit()`, but it waits for each listener to resolve before
	 * triggering the next one. This can be useful if your events depend on each
	 * other. Although ideally they should not. Prefer `emit()` whenever
	 * possible.
	 *
	 * If any of the listeners throw/reject, the returned promise will be
	 * rejected with the error and the remaining listeners will *not* be called.
	 *
	 * Returns a promise for when all the event listeners are done.
	 */
	emitSerial(eventName: string, eventData?: any): Promise<void>;

	/**
	 * Subscribe to be notified about any event.
	 *
	 * Returns a method to unsubscribe.
	 */
	onAny(listener: (eventName: string, eventData?: any) => any): Emittery.UnsubscribeFn;

	/**
	 * Remove an `onAny` subscription.
	 */
	offAny(listener: (eventName: string, eventData?: any) => any): void;

	/**
	 * Clear all event listeners on the instance.
	 *
	 * If `eventName` is given, only the listeners for that event are cleared.
	 */
	clearListeners(eventName?: string): void;

	/**
	 * The number of listeners for the `eventName` or all events if not
	 * specified.
	 */
	listenerCount(eventName?: string): number;
}

declare namespace Emittery {
	/**
	 * Removes an event subscription.
	 */
	type UnsubscribeFn = () => void;

	/**
	 * Maps event names to their emitted data type.
	 */
	interface Events {
		[eventName: string]: any;
	}

	/**
	 * Async event emitter.
	 *
	 * Must list supported events and the data type they emit, if any.
	 *
	 * For example:
	 *
	 * ```ts
	 * import Emittery = require('emittery');
	 *
	 * const ee = new Emittery.Typed<{value: string}, 'open' | 'close'>();
	 *
	 * ee.emit('open');
	 * ee.emit('value', 'foo\n');
	 * ee.emit('value', 1); // TS compilation error
	 * ee.emit('end'); // TS compilation error
	 * ```
	 */
	class Typed<EventDataMap extends Events, EmptyEvents extends string = never> extends Emittery {
		on<Name extends Extract<keyof EventDataMap, string>>(eventName: Name, listener: (eventData: EventDataMap[Name]) => any): Emittery.UnsubscribeFn;
		on<Name extends EmptyEvents>(eventName: Name, listener: () => any): Emittery.UnsubscribeFn;

		once<Name extends Extract<keyof EventDataMap, string>>(eventName: Name): Promise<EventDataMap[Name]>;
		once<Name extends EmptyEvents>(eventName: Name): Promise<void>;

		off<Name extends Extract<keyof EventDataMap, string>>(eventName: Name, listener: (eventData: EventDataMap[Name]) => any): void;
		off<Name extends EmptyEvents>(eventName: Name, listener: () => any): void;

		onAny(listener: (eventName: Extract<keyof EventDataMap, string> | EmptyEvents, eventData?: EventDataMap[Extract<keyof EventDataMap, string>]) => any): Emittery.UnsubscribeFn;
		offAny(listener: (eventName: Extract<keyof EventDataMap, string> | EmptyEvents, eventData?: EventDataMap[Extract<keyof EventDataMap, string>]) => any): void;

		emit<Name extends Extract<keyof EventDataMap, string>>(eventName: Name, eventData: EventDataMap[Name]): Promise<void>;
		emit<Name extends EmptyEvents>(eventName: Name): Promise<void>;

		emitSerial<Name extends Extract<keyof EventDataMap, string>>(eventName: Name, eventData: EventDataMap[Name]): Promise<void>;
		emitSerial<Name extends EmptyEvents>(eventName: Name): Promise<void>;
	}
}
