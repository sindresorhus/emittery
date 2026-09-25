/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-floating-promises */
import {
	expectType,
	expectError,
	expectNotAssignable,
	expectAssignable,
} from 'tsd';
import {pEventIterator} from 'p-event';
import Emittery, {type EmitteryAsyncIterator, type EmitteryEvent, type EventName} from './index.js';

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
		expectType<PropertyKey | undefined>(eventName);
		expectType<AnyListener>(listener);
	});
	ee.on(Emittery.listenerRemoved, ({data: {eventName, listener}}) => {
		expectType<PropertyKey | undefined>(eventName);
		expectType<AnyListener>(listener);
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
		expectType<PropertyKey | undefined>(listenerAddedEvent.data.eventName);
		expectType<AnyListener>(listenerAddedEvent.data.listener);
		const listenerRemovedEvent = await ee.once(Emittery.listenerRemoved);
		expectType<PropertyKey | undefined>(listenerRemovedEvent.data.eventName);
		expectType<AnyListener>(listenerRemovedEvent.data.listener);
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
		expectAssignable<string>(type);
		expectAssignable<string | undefined>(debugName);
		expectAssignable<string | undefined>(eventName);
		expectAssignable<MyEventData[keyof MyEventData]>(eventData);
	};

	const debugOptions = {name: 'test', enabled: true, logger: myLogger};
	const emitterWithEnabledDebugOnly = new Emittery<MyEventData>({debug: {enabled: true}});
	const unsafeLogger = (type: string, debugName: string): void => {
		expectAssignable<string>(type);
		expectAssignable<string>(debugName);
	};

	expectError(new Emittery<MyEventData>({debug: {enabled: true, logger: unsafeLogger}}));

	// Global debug flag
	expectAssignable<boolean>(Emittery.isDebugEnabled);

	// General debug options
	expectAssignable<typeof ee.debug>(debugOptions);
	expectAssignable<Emittery<MyEventData>>(emitterWithEnabledDebugOnly);
	expectAssignable<string | undefined>(ee.debug.name);
	expectAssignable<boolean | undefined>(ee.debug.enabled);

	// Debug logger
	expectNotAssignable<() => undefined>(ee.debug.logger);
	expectNotAssignable<(data: unknown) => undefined>(ee.debug.logger);
	expectNotAssignable<(type: string, debugName: number) => undefined>(ee.debug.logger);
	expectNotAssignable<((type: string, debugName?: number, eventName?: string, eventData?: Record<string, any>) => void) | undefined>(ee.debug.logger);
	expectAssignable<typeof ee.debug.logger>(myLogger);
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
		expectType<EmitteryEvent<'open', undefined>>(event);
		expectAssignable<{name: 'open'; data?: undefined}>(event);
		expectNotAssignable<{name: 'open'; data: undefined}>(event);
	});
	ee.on('open', ({data}) => {
		expectType<undefined>(data);
	});

	ee.on('value', () => {});
	ee.on('value', ({data}) => {
		expectType<string>(data);
	});
	ee.on(['value', 'other'], ({name, data}) => {
		expectType<'value' | 'other'>(name);
		expectType<string | number>(data);
	});
	ee.on(['value', 'other'], event => {
		if (event.name === 'value') {
			expectType<string>(event.data);
		} else {
			expectType<number>(event.data);
		}
	});
	ee.on('maybe', event => {
		expectType<string | undefined>(event.data);
	});
	const listener = ({data}: EmitteryEvent<'value', string>) => undefined;
	ee.on('value', listener);
	ee.off('value', listener);
	const test = async () => {
		const event = await ee.once('value');
		expectType<EmitteryEvent<'value', string>>(event);
		const multiEvent = await ee.once(['value', 'other']);
		expectType<EmitteryEvent<'value', string> | EmitteryEvent<'other', number>>(multiEvent);
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
		expectType<string>(data);
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
		expectType<'value' | 'open' | 'close' | 'other'>(event.name);
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
		expectType<'value' | 'other'>(name);
		expectType<string | number>(data);
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
			expectType<'value' | 'open' | 'close'>(event.name);
		}

		const ee2 = new Emittery<{
			value: string;
			other: number;
		}>();

		for await (const event of ee2.anyEvent()) {
			expectType<'value' | 'other'>(event.name);
			expectType<string | number>(event.data);
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
			expectType<string>(event.data);
			expectType<'value'>(event.name);
		}

		for await (const event of ee.events(['value', 'other'])) {
			expectType<'value' | 'other'>(event.name);
			expectType<string | number>(event.data);
		}

		for await (const event of ee.events(['value', 'open'])) {
			expectType<'value' | 'open'>(event.name);
		}

		const ee2 = new Emittery();
		for await (const event of ee2.events('unknown')) {
			expectAssignable<{name: EventName}>(event);
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

expectAssignable<typeof MixinBase>(Emittery.mixin('emittery')(MixinBase));

// Mixin - the direct call form is typed with the mixed in members
{
	class MixedBase {
		test() {}
	}

	const mixedClass = Emittery.mixin('emittery')(MixedBase);
	const useInstance = (instance: InstanceType<typeof mixedClass>) => {
		expectType<Promise<void>>(instance.emit('anEvent'));
		expectType<Emittery>(instance.emittery);
	};

	expectAssignable<unknown>(useInstance);
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

	expectAssignable<unknown>(useInstance);
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
	expectAssignable<Disposable>(off);
	expectType<() => void>(off[Symbol.dispose]);

	const offAny = ee.onAny(() => {});
	expectAssignable<Disposable>(offAny);

	const offInit = ee.init('anEvent', () => {});
	expectAssignable<Disposable>(offInit);
}

// Symbol.asyncDispose - iterators are AsyncDisposable
{
	const ee = new Emittery();
	const eventsIterator = ee.events('anEvent');
	expectAssignable<AsyncDisposable>(eventsIterator);

	const anyIterator = ee.anyEvent();
	expectAssignable<AsyncDisposable>(anyIterator);
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
	expectType<Promise<IteratorResult<EmitteryEvent<'open', string>, undefined>>>(iterator.return());
	expectType<Promise<IteratorResult<EmitteryEvent<'open', string>, 'value'>>>(iterator.return('value'));
	expectType<Promise<IteratorResult<EmitteryEvent<'open', string>, undefined>>>(iterator.next());

	// `return()` awaits its argument, so a thenable resolves to the value it holds.
	expectType<Promise<IteratorResult<EmitteryEvent<'open', string>, number>>>(iterator.return(Promise.resolve(1)));

	// The iterator returns itself, so the result of `[Symbol.asyncIterator]()` is just as narrow and still disposable.
	expectType<EmitteryAsyncIterator<EmitteryEvent<'open', string>>>(iterator[Symbol.asyncIterator]());
	expectAssignable<AsyncIteratorObject<EmitteryEvent<'open', string>, undefined>>(iterator);

	const anyIterator = ee.anyEvent();
	expectType<Promise<IteratorResult<EmitteryEvent<'open', string> | EmitteryEvent<'close', undefined>, undefined>>>(anyIterator.return());
}

// An event name array can contain undefined, which means "everything"
{
	const ee = new Emittery<{open: string; close: undefined}>();

	ee.clearListeners(['open', undefined]);
	ee.listenerCount(['open', undefined]);
	ee.clearListeners(undefined);
	ee.listenerCount(undefined);
}
