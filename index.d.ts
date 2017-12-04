// Type definitions for emittery
// Project: emittery
// Definitions by: Sindre Sorhus <sindresorhus.com>

export = Emittery;

/**
 * Async event emitter.
 */
declare class Emittery {

		/**
		 * Subscribe to an event.
		 *
		 * Using the same listener multiple times for the same event will result
		 * in only one method call per emitted event.
		 *
		 * @returns Unsubscribe method.
		 */
		on(eventName: string, listener: (eventData?: any) => any): () => void;

		/**
		 * Subscribe to an event only once. It will be unsubscribed after the first
		 * event.
		 *
		 * @returns Promise for the event data when eventName is emitted
		 */
		once(eventName: string): Promise<any>;

		/**
		 * Unsubscribe to an event.
		 *
		 * If you don't pass in a listener, it will remove all listeners for that
		 * event.
		 *
		 * @param [listener]
		 */
		off(eventName: string, listener?: (eventData?: any) => any): void;

		/**
		 * Subscribe to be notified about any event.
		 *
		 * @returns A method to unsubscribe
		 */
		onAny(listener: (eventName: string, eventData?: any) => any): () => void;

		/**
		 * Unsubscribe an onAny listener.
		 *
		 * If you don't pass in a listener, it will remove all onAny listeners.
		 *
		 * @param [listener]
		 */
		offAny(listener?: (eventName: string, eventData?: any) => any): void;

		/**
		 * Trigger an event asynchronously, optionally with some data. Listeners
		 * are called in the order they were added, but execute concurrently.
		 *
		 * Returns a promise for when all the event listeners are done. Done meaning
		 * executed if synchronous or resolved when an async/promise-returning
		 * function. You usually wouldn't want to wait for this, but you could for
		 * example catch possible errors. If any of the listeners throw/reject, the
		 * returned promise will be rejected with the error, but the other listeners
		 * will not be affected.
		 *
		 * @returns A promise for when all the event listeners are done.
		 */
		emit(eventName: string, eventData?: any): Promise<void>;

		/**
		 * Same as `emit`, but it waits for each listener to resolve before
		 * triggering the next one. This can be useful if your events depend on each
		 * other. Although ideally they should not. Prefer emit() whenever possible.
		 *
		 * If any of the listeners throw/reject, the returned promise will be
		 * rejected with the error and the remaining listeners will not be called.
		 *
		 * @returns A promise for the last event listener settle or first one rejecting.
		 */
		emitSerial(eventName: string, eventData?: any): Promise<void>;

		/**
		 * Clear all event listeners on the instance.
		 */
		clear(): void;

		/**
		 * Count event listeners for the eventName or all events if not specified.
		 *
		 * @param eventName
		 * @returns Listener count.
		 */
		listenerCount(eventName?: string): number;
}

declare namespace Emittery {

	/**
	 * A map of event names to the data type they emit.
	 */
	interface IEvents {
		[eventName: string]: any;
	}

	/**
	 * Alternative interface for an Emittery object; must list supported events
	 * the data type they emit.
	 */
	export interface IMapped<Events extends IEvents> {
		on<Name extends keyof Events>(eventName: Name, listener: (eventData: Events[Name]) => any): () => void;
		once<Name extends keyof Events>(eventName: Name): Promise<Events[Name]>;
		off<Name extends keyof Events>(eventName: Name, listener?: (eventData: Events[Name]) => any): void;

		onAny<Name extends keyof Events>(listener: (eventName: Name, eventData: Events[Name]) => any): () => void;
		offAny<Name extends keyof Events>(listener?: (eventName: Name, eventData: Events[Name]) => any): void;

		emit<Name extends keyof Events>(eventName: Name, eventData: Events[Name]): Promise<void>;
		emitSerial<Name extends keyof Events>(eventName: Name, eventData: Events[Name]): Promise<void>;
	}

	/**
	 * Alternative signature for the Emittery class; must list supported events
	 * the data type they emit.
	 *
	 * @example
	 * ```ts
	 * import _Emittery = require('emittery');
	 *
	 * // Alias Emittery class with Events map generic
	 * const Emittery = _Emittery as _Emittery.IMappedCtor;
	 * const ee = new Emittery<{open: null, value: string, close: null}>();
	 *
	 * ee.emit('open', null);
	 * ee.emit('value', 'foo\n');
	 * ee.emit('end', null); // TS emit error
	 * ```
	 */
	interface IMappedCtor {
		new <Events extends IEvents>(): IMapped<Events>
	}

}
