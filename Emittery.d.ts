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
		*
		* If you don't pass in a `listener`, it will remove all listeners for that
		* event.
		*/
		off(eventName: string, listener?: (eventData?: any) => any): void;

		/**
		 * Subscribe to an event only once. It will be unsubscribed after the first
		 * event.
		 *
		 * Returns a promise for the event data when `eventName` is emitted.
		 */
		once(eventName: string): Promise<any>;

		/**
		 * Get an asynchronous iterator which buffers data each time an event is
		 * emitted.
		 *
		 * Call `return()` on the iterator to remove the subscription.
		 */
		events(eventName: string): AsyncIterableIterator<any>;

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
		Remove an `onAny` subscription.

		If you don't pass in a `listener`, it will remove all `onAny` subscriptions.
		 */
		offAny(listener?: (eventName: string, eventData?: any) => any): void;

		/**
		 * Get an asynchronous iterator which buffers a tuple of an event name and
		 * data each time an event is emitted.
		 *
		 * Call `return()` on the iterator to remove the subscription.
		 */
		anyEvent(): AsyncIterableIterator<[string, any]>;

		/**
		 * Clear all event listeners on the instance.
		 */
		clear(): void;

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
	class Typed<EventDataMap extends Events, EmptyEvents = never> extends Emittery {
		on<Name extends keyof EventDataMap>(eventName: Name, listener: (eventData: EventDataMap[Name]) => any): Emittery.UnsubscribeFn;
		on<Name extends EmptyEvents>(eventName: Name, listener: () => any): Emittery.UnsubscribeFn;

		once<Name extends keyof EventDataMap>(eventName: Name): Promise<EventDataMap[Name]>;
		once<Name extends EmptyEvents>(eventName: Name): Promise<void>;

		off<Name extends keyof EventDataMap>(eventName: Name, listener?: (eventData: EventDataMap[Name]) => any): void;
		off<Name extends EmptyEvents>(eventName: Name, listener?: () => any): void;

		events<Name extends keyof EventDataMap>(eventName: Name): AsyncIterableIterator<EventDataMap[Name]>;
		events<Name extends EmptyEvents>(eventName: Name): AsyncIterableIterator<void>;

		onAny<Name extends keyof EventDataMap>(listener: (eventName: Name, eventData: EventDataMap[Name]) => any): Emittery.UnsubscribeFn;
		onAny<Name extends EmptyEvents>(listener: (eventName: Name) => any): Emittery.UnsubscribeFn;

		offAny<Name extends keyof EventDataMap>(listener?: (eventName: Name, eventData: EventDataMap[Name]) => any): void;
		offAny<Name extends EmptyEvents>(listener?: (eventName: Name) => any): void;

		anyEvent<Name extends keyof EventDataMap>(): AsyncIterableIterator<[Name, EventDataMap[Name]]>;
		anyEvent<Name extends EmptyEvents>(): AsyncIterableIterator<[Name, void]>;

		emit<Name extends keyof EventDataMap>(eventName: Name, eventData: EventDataMap[Name]): Promise<void>;
		emit<Name extends EmptyEvents>(eventName: Name): Promise<void>;

		emitSerial<Name extends keyof EventDataMap>(eventName: Name, eventData: EventDataMap[Name]): Promise<void>;
		emitSerial<Name extends EmptyEvents>(eventName: Name): Promise<void>;
	}
}
