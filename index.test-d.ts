/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-floating-promises */
// `tsd` used to load the `esnext` lib, which has `Disposable` and `AsyncDisposable`.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="esnext.disposable" />
import {expectTypeOf, expectError} from 'nz';
import {pEventIterator} from 'p-event';
import Emittery, {
	type EmitteryAsyncIterator, type EmitteryEvent, type EmitteryOncePromise, type EventName, type ReadonlyEmittery,
} from './index.js';

type AnyListener = (event: unknown) => void | Promise<void>;

// Emit
{
	const ee = new Emittery<{anEvent: undefined}>();
	ee.emit('anEvent');
	const ee2 = new Emittery<{anEvent: string}>();
	ee2.emit('anEvent', 'some data');
}

// On
{
	const ee = new Emittery();
	ee.on('anEvent', () => undefined);
	ee.on('anEvent', async () => {});
	ee.on('anEvent', event => undefined);
	ee.on('anEvent', async event => {});
	ee.on('anEvent', async event => {}, {signal: new AbortController().signal});
	ee.on(['anEvent', 'anotherEvent'], async event => undefined);
	ee.on(Emittery.listenerAdded, ({data: {eventName, listener}}) => {
		expectTypeOf(eventName).toBe<PropertyKey | undefined>();
		expectTypeOf(listener).toBe<AnyListener>();
	});
	ee.on(Emittery.listenerRemoved, ({data: {eventName, listener}}) => {
		expectTypeOf(eventName).toBe<PropertyKey | undefined>();
		expectTypeOf(listener).toBe<AnyListener>();
	});
}

// Off
{
	const ee = new Emittery();
	ee.off('anEvent', () => undefined);
	ee.off('anEvent', async () => {});
	ee.off('anEvent', event => undefined);
	ee.off('anEvent', async event => {});
	ee.off(Emittery.listenerAdded, ({data: {eventName, listener}}) => {});
	ee.off(Emittery.listenerRemoved, ({data: {eventName, listener}}) => {});
}

// Once
{
	const ee = new Emittery();
	const test = async () => {
		await ee.once('anEvent');
		const listenerAddedEvent = await ee.once(Emittery.listenerAdded);
		expectTypeOf(listenerAddedEvent.data.eventName).toBe<PropertyKey | undefined>();
		expectTypeOf(listenerAddedEvent.data.listener).toBe<AnyListener>();
		const listenerRemovedEvent = await ee.once(Emittery.listenerRemoved);
		expectTypeOf(listenerRemovedEvent.data.eventName).toBe<PropertyKey | undefined>();
		expectTypeOf(listenerRemovedEvent.data.listener).toBe<AnyListener>();
		const oncePromise = ee.once('anotherEvent');
		oncePromise.off();
		await oncePromise;
	};
}

{
	const ee = new Emittery();
	expectError(ee.emit('anEvent', 'some data', 'and more'));
}

{
	const ee = new Emittery();
	expectError(ee.on('anEvent', (data: any, more: any) => undefined));
}

// IsDebug
{
	type MyEventData = {
		value: string;
		open: undefined;
		close: boolean;
	};

	const ee = new Emittery<MyEventData>();

	const myLogger = (type: string, debugName?: string, eventName?: keyof MyEventData, eventData?: MyEventData[keyof MyEventData]): void => {
		expectTypeOf(type).toBeAssignableTo<string>();
		expectTypeOf(debugName).toBeAssignableTo<string | undefined>();
		expectTypeOf(eventName).toBeAssignableTo<string | undefined>();
		expectTypeOf(eventData).toBeAssignableTo<MyEventData[keyof MyEventData]>();
	};

	const debugOptions = {name: 'test', enabled: true, logger: myLogger};
	const emitterWithEnabledDebugOnly = new Emittery<MyEventData>({debug: {enabled: true}});
	const unsafeLogger = (type: string, debugName: string): void => {
		expectTypeOf(type).toBeAssignableTo<string>();
		expectTypeOf(debugName).toBeAssignableTo<string>();
	};

	expectError(new Emittery<MyEventData>({debug: {enabled: true, logger: unsafeLogger}}));

	// Global debug flag
	expectTypeOf(Emittery.isDebugEnabled).toBeAssignableTo<boolean>();

	// General debug options
	expectTypeOf(debugOptions).toBeAssignableTo<typeof ee.debug>();
	expectTypeOf(emitterWithEnabledDebugOnly).toBeAssignableTo<Emittery<MyEventData>>();
	expectTypeOf(ee.debug.name).toBeAssignableTo<string | undefined>();
	expectTypeOf(ee.debug.enabled).toBeAssignableTo<boolean | undefined>();

	// Debug logger
	expectTypeOf(ee.debug.logger).not.toBeAssignableTo<() => undefined>();
	expectTypeOf(ee.debug.logger).not.toBeAssignableTo<(data: unknown) => undefined>();
	expectTypeOf(ee.debug.logger).not.toBeAssignableTo<(type: string, debugName: number) => undefined>();
	expectTypeOf(ee.debug.logger).not.toBeAssignableTo<((type: string, debugName?: number, eventName?: string, eventData?: Record<string, any>) => void) | undefined>();
	expectTypeOf(myLogger).toBeAssignableTo<typeof ee.debug.logger>();
}

// Strict typing for emission
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
	}>();
	ee.emit('open');
	ee.emit('close');
	ee.emit('value', 'test');
	expectError(ee.emit('value'));
	expectError(ee.emit('open', 'test'));
}

// Strict typing for listeners
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
		other: number;
		maybe: string | undefined;
	}>();
	ee.on('open', () => {});
	ee.on('open', event => {
		expectTypeOf(event).toBe<EmitteryEvent<'open', undefined>>();
		expectTypeOf(event).toBeAssignableTo<{name: 'open'; data?: undefined}>();
		expectTypeOf(event).not.toBeAssignableTo<{name: 'open'; data: undefined}>();
	});
	ee.on('open', ({data}) => {
		expectTypeOf(data).toBe<undefined>();
	});

	ee.on('value', () => {});
	ee.on('value', ({data}) => {
		expectTypeOf(data).toBe<string>();
	});
	ee.on(['value', 'other'], ({name, data}) => {
		expectTypeOf(name).toBe<'value' | 'other'>();
		expectTypeOf(data).toBe<string | number>();
	});
	ee.on(['value', 'other'], event => {
		if (event.name === 'value') {
			expectTypeOf(event.data).toBe<string>();
		} else {
			expectTypeOf(event.data).toBe<number>();
		}
	});
	ee.on('maybe', event => {
		expectTypeOf(event.data).toBe<string | undefined>();
	});
	const listener = ({data}: EmitteryEvent<'value', string>) => undefined;
	ee.on('value', listener);
	ee.off('value', listener);
	const test = async () => {
		const event = await ee.once('value');
		expectTypeOf(event).toBe<EmitteryEvent<'value', string>>();
		const multiEvent = await ee.once(['value', 'other']);
		expectTypeOf(multiEvent).toBe<EmitteryEvent<'value', string> | EmitteryEvent<'other', number>>();
	};

	expectError(ee.on('value', (value: number) => {}));
}

// Async listeners
{
	const ee = new Emittery<{
		open: undefined;
		close: string;
	}>();
	ee.on('open', () => {});
	ee.on('open', async () => {});
	ee.on('open', async () => {});
	ee.on('close', async ({data}) => {
		expectTypeOf(data).toBe<string>();
	});
}

// Strict typing for onAny, offAny listeners
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
		other: number;
	}>();

	ee.onAny(event => {
		// Some events are dataless so `data` only exists on some union variants
		expectTypeOf(event.name).toBe<'value' | 'open' | 'close' | 'other'>();
	});

	ee.onAny(() => {}, {signal: new AbortController().signal});

	const listener = ({name}: {name: string}) => {};
	ee.onAny(listener);
	ee.offAny(listener);
}

// Strict typing for onAny, offAny listeners for an Emittery that only has listeners with arguments
{
	const ee = new Emittery<{
		value: string;
		other: number;
	}>();

	ee.onAny(({name, data}) => {
		expectTypeOf(name).toBe<'value' | 'other'>();
		expectTypeOf(data).toBe<string | number>();
	});
}

// Strict typing for anyEvent iterator
{
	const testAnyEvent = async () => {
		const ee = new Emittery<{
			value: string;
			open: undefined;
			close: undefined;
		}>();

		for await (const event of ee.anyEvent()) {
			expectTypeOf(event.name).toBe<'value' | 'open' | 'close'>();
		}

		const ee2 = new Emittery<{
			value: string;
			other: number;
		}>();

		for await (const event of ee2.anyEvent()) {
			expectTypeOf(event.name).toBe<'value' | 'other'>();
			expectTypeOf(event.data).toBe<string | number>();
		}
	};
}

// Strict typing for `.events` iterator
{
	const testEventsIterator = async () => {
		const ee = new Emittery<{
			value: string;
			open: undefined;
			close: undefined;
			other: number;
		}>();

		for await (const event of ee.events('value')) {
			expectTypeOf(event.data).toBe<string>();
			expectTypeOf(event.name).toBe<'value'>();
		}

		for await (const event of ee.events(['value', 'other'])) {
			expectTypeOf(event.name).toBe<'value' | 'other'>();
			expectTypeOf(event.data).toBe<string | number>();
		}

		for await (const event of ee.events(['value', 'open'])) {
			expectTypeOf(event.name).toBe<'value' | 'open'>();
		}

		const ee2 = new Emittery();
		for await (const event of ee2.events('unknown')) {
			expectTypeOf(event).toBeAssignableTo<{name: EventName}>();
		}
	};
}

// Compatibility with p-event, without explicit types
{
	const ee = new Emittery();
	pEventIterator(ee, 'data', {
		resolutionEvents: ['finish'],
	});
}

// Compatibility with p-event, with explicit types
{
	type EventData = {
		data: unknown;
		error: unknown;
		finish: undefined;
	};
	const ee = new Emittery<EventData>();
	pEventIterator<keyof EventData, unknown>(ee, 'data', {
		resolutionEvents: ['finish'],
	});
}

// Mixin - the returned class is still assignable to T
class MixinBase {
	test() {}
}

expectTypeOf(Emittery.mixin('emittery')(MixinBase)).toBeAssignableTo<typeof MixinBase>();

// Mixin - the direct call form is typed with the mixed in members
{
	class MixedBase {
		test() {}
	}

	const mixedClass = Emittery.mixin('emittery')(MixedBase);
	const useInstance = (instance: InstanceType<typeof mixedClass>) => {
		expectTypeOf(instance.emit('anEvent')).toBe<Promise<void>>();
		expectTypeOf(instance.emittery).toBe<Emittery>();
	};

	expectTypeOf(useInstance).toBeAssignableTo<unknown>();
}

// Mixin - the direct call form with specific method names
{
	class MixedBase {
		test() {}
	}

	const mixedClass = Emittery.mixin('emittery', ['emit', 'on'])(MixedBase);
	const useInstance = (instance: InstanceType<typeof mixedClass>) => {
		instance.emit('anEvent');
		instance.on('anEvent', () => {});
	};

	expectTypeOf(useInstance).toBeAssignableTo<unknown>();
	expectError((instance: InstanceType<typeof mixedClass>) => {
		instance.off('anEvent', () => {});
	});
}

// Mixin - the emittery property cannot also be a mixed in method, which the runtime rejects
expectError(Emittery.mixin('emit', ['emit', 'on'])(class {})); // eslint-disable-line @typescript-eslint/no-extraneous-class
expectError(Emittery.mixin('emit')(class {})); // eslint-disable-line @typescript-eslint/no-extraneous-class

// Mixin - works with parameterized constructor
Emittery.mixin('emittery')(class { // eslint-disable-line @typescript-eslint/no-extraneous-class
	constructor(argument: string) {} // eslint-disable-line @typescript-eslint/no-useless-constructor
});

// Mixin - symbol as emitteryPropertyName
Emittery.mixin(Symbol('emittery'))(MixinBase);

// Mixin - works with abstract class (validates `abstract new` constraint)
@Emittery.mixin('emittery')
abstract class MixinAbstractClass {
	abstract abstractMethod(): void;
}

// Mixin - as TC39 decorator
@Emittery.mixin('emittery')
class MixinDecoratorClass {
	test() {}
}

// Mixin - as TC39 decorator with specific method names
@Emittery.mixin('emittery', ['emit', 'on'])
class MixinDecoratorWithMethodNames {
	test() {}
}

// Mixin - error: non-string/symbol as emitteryPropertyName
expectError(Emittery.mixin(42));

// Mixin - error: string instead of array for methodNames
expectError(Emittery.mixin('emittery', 'on'));

// Mixin - error: plain object as target (not a constructor)
expectError(Emittery.mixin('emittery')({}));

// Symbol.dispose - UnsubscribeFunction is Disposable
{
	const ee = new Emittery();
	const off = ee.on('anEvent', () => {});
	expectTypeOf(off).toBeAssignableTo<Disposable>();
	expectTypeOf(off[Symbol.dispose]).toBe<() => void>();

	const offAny = ee.onAny(() => {});
	expectTypeOf(offAny).toBeAssignableTo<Disposable>();

	const offInit = ee.init('anEvent', () => {});
	expectTypeOf(offInit).toBeAssignableTo<Disposable>();
}

// Symbol.asyncDispose - iterators are AsyncDisposable
{
	const ee = new Emittery();
	const eventsIterator = ee.events('anEvent');
	expectTypeOf(eventsIterator).toBeAssignableTo<AsyncDisposable>();

	const anyIterator = ee.anyEvent();
	expectTypeOf(anyIterator).toBeAssignableTo<AsyncDisposable>();
}

// Once with signal option
{
	const ee = new Emittery();
	ee.once('anEvent', {signal: new AbortController().signal});
	ee.once('anEvent', {predicate: () => true, signal: new AbortController().signal});
	ee.once('anEvent', {predicate: () => true});
}

// Events with signal option
{
	const ee = new Emittery();
	ee.events('anEvent', {signal: new AbortController().signal});
}

// AnyEvent with signal option
{
	const ee = new Emittery();
	ee.anyEvent({signal: new AbortController().signal});
}

// BindMethods accepts any object, including a class instance
{
	const ee = new Emittery();

	class Target {
		value = 1;
	}

	const target = new Target();
	ee.bindMethods(target);
	ee.bindMethods({}, ['on', 'off']);
	ee.bindMethods(target, ['emit']);
	expectError(ee.bindMethods({}, ['notAMethod']));
}

// The meta event names are valid everywhere the runtime accepts them
{
	const ee = new Emittery<{open: string; close: undefined}>();

	ee.on(Emittery.listenerAdded, () => {});
	ee.events(Emittery.listenerAdded);
	ee.events(Emittery.listenerRemoved);
	ee.listenerCount(Emittery.listenerAdded);
	ee.clearListeners(Emittery.listenerAdded);
	ee.logIfDebugEnabled('emit', Emittery.listenerAdded);

	// The meta event names are still blocked where the runtime rejects them.
	expectError(ee.init(Emittery.listenerAdded, () => {}));
	expectError(ee.emit(Emittery.listenerAdded));
	expectError(ee.emitSerial(Emittery.listenerRemoved));
}

// Emit without data works on an untyped emitter
{
	const ee = new Emittery();
	ee.emit('anEvent');
	ee.emit('anEvent', 'data');
	ee.emit('anEvent', undefined);
	expectError(ee.emit());
}

// The iterators are disposable, iterable, and have a callable return()
{
	const ee = new Emittery<{open: string; close: undefined}>();
	const iterator = ee.events('open');
	// `TReturn` is spelled out because `IteratorResult` defaults it to `any`, which would make these assertions pass for any iterator type.
	expectTypeOf(iterator.return()).toBe<Promise<IteratorResult<EmitteryEvent<'open', string>, undefined>>>();
	expectTypeOf(iterator.return('value' as const)).toBe<Promise<IteratorResult<EmitteryEvent<'open', string>, 'value'>>>();
	expectTypeOf(iterator.next()).toBe<Promise<IteratorResult<EmitteryEvent<'open', string>, undefined>>>();

	// `return()` awaits its argument, so a thenable resolves to the value it holds.
	expectTypeOf(iterator.return(Promise.resolve(1))).toBe<Promise<IteratorResult<EmitteryEvent<'open', string>, number>>>();

	// The iterator returns itself, so the result of `[Symbol.asyncIterator]()` is just as narrow and still disposable.
	expectTypeOf(iterator[Symbol.asyncIterator]()).toBe<EmitteryAsyncIterator<EmitteryEvent<'open', string>>>();
	expectTypeOf(iterator).toBeAssignableTo<AsyncIteratorObject<EmitteryEvent<'open', string>, undefined>>();

	const anyIterator = ee.anyEvent();
	expectTypeOf(anyIterator.return()).toBe<Promise<IteratorResult<EmitteryEvent<'open', string> | EmitteryEvent<'close', undefined>, undefined>>>();
}

// An event name array can contain undefined, which means "everything"
{
	const ee = new Emittery<{open: string; close: undefined}>();

	ee.clearListeners(['open', undefined]);
	ee.listenerCount(['open', undefined]);
	ee.clearListeners(undefined);
	ee.listenerCount(undefined);
}

// A readonly emitter can subscribe but not emit
{
	const ee = new Emittery<{open: string; close: undefined}>();
	const readonlyEmitter: ReadonlyEmittery<{open: string; close: undefined}> = ee;

	readonlyEmitter.on('open', ({data}) => {
		expectTypeOf(data).toBe<string>();
	});
	readonlyEmitter.on(Emittery.listenerAdded, () => {});
	readonlyEmitter.off('close', () => {});
	readonlyEmitter.onAny(() => {});
	readonlyEmitter.offAny(() => {});
	readonlyEmitter.events('open');
	readonlyEmitter.anyEvent();
	readonlyEmitter.listenerCount('open');
	expectTypeOf(readonlyEmitter.once('open')).toBe<EmitteryOncePromise<EmitteryEvent<'open', string>>>();

	expectError(readonlyEmitter.on('other', () => {}));
	expectError(readonlyEmitter.emit('close'));
	expectError(readonlyEmitter.emitSerial('close'));
	expectError(readonlyEmitter.clearListeners());
	expectError(readonlyEmitter.init('open', () => {}));

	// An untyped emitter and an emitter with a custom `DatalessEvents` type argument are assignable too.
	expectTypeOf(new Emittery()).toBeAssignableTo<ReadonlyEmittery>();
	expectTypeOf(new Emittery<{open: string}, {open: string}, 'open'>()).toBeAssignableTo<ReadonlyEmittery<{open: string}>>();
}

// An object with the bound subscribe methods of an emitter is a readonly emitter
{
	const ee = new Emittery<{open: string; close: undefined}>();
	const readonlyEmitter: ReadonlyEmittery<{open: string; close: undefined}> = Object.freeze({
		on: ee.on,
		off: ee.off,
		once: ee.once,
		events: ee.events,
		onAny: ee.onAny,
		offAny: ee.offAny,
		anyEvent: ee.anyEvent,
		listenerCount: ee.listenerCount,
	});
	readonlyEmitter.on('open', () => {});
}
