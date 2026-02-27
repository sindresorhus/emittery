/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-floating-promises */
import {expectType, expectError, expectNotAssignable, expectAssignable} from 'tsd';
import {pEventIterator} from 'p-event';
import Emittery, {type EmitteryEvent, type EventName} from './index.js';

type AnyListener = (event: unknown) => void | Promise<void>;

// Emit
{
	const ee = new Emittery();
	ee.emit('anEvent');
	ee.emit('anEvent', 'some data');
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
		await ee.once(Emittery.listenerAdded).then(({data: {eventName, listener}}) => {
			expectType<PropertyKey | undefined>(eventName);
			expectType<AnyListener>(listener);
		});
		await ee.once(Emittery.listenerRemoved).then(({data: {eventName, listener}}) => {
			expectType<PropertyKey | undefined>(eventName);
			expectType<AnyListener>(listener);
		});
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

	const myLogger = (type: string, debugName: string, eventName?: keyof MyEventData, eventData?: MyEventData[keyof MyEventData]): void => {
		expectAssignable<string>(type);
		expectAssignable<string>(debugName);
		expectAssignable<string | undefined>(eventName);
		expectAssignable<MyEventData[keyof MyEventData]>(eventData);
	};

	const debugOptions = {name: 'test', enabled: true, logger: myLogger};

	// Global debug flag
	expectAssignable<boolean>(Emittery.isDebugEnabled);

	// General debug options
	expectAssignable<typeof ee.debug>(debugOptions);
	expectAssignable<string>(ee.debug.name);
	expectAssignable<boolean | undefined>(ee.debug.enabled);

	// Debug logger
	expectNotAssignable<() => undefined>(ee.debug.logger);
	expectNotAssignable<(data: unknown) => undefined>(ee.debug.logger);
	expectNotAssignable<(type: string, debugName: string) => undefined>(ee.debug.logger);
	expectNotAssignable<((type: string, debugName: string, eventName?: string, eventData?: Record<string, any>) => void) | undefined>(ee.debug.logger);
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

// Mixin type
Emittery.mixin('emittery')(class {
	test() {}
});

// Mixin type - arguments in constructor
Emittery.mixin('emittery')(class { // eslint-disable-line @typescript-eslint/no-extraneous-class
	constructor(argument: string) {} // eslint-disable-line @typescript-eslint/no-useless-constructor
});
