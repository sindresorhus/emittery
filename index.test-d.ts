import { expectType, expectError } from "tsd";
import Emittery = require(".");

// emit
{
	const ee = new Emittery();
	ee.emit("anEvent");
	ee.emit("anEvent", "some data");
}

// on
{
	const ee = new Emittery();
	ee.on("anEvent", () => undefined);
	ee.on("anEvent", () => Promise.resolve());
	ee.on("anEvent", data => undefined);
	ee.on("anEvent", data => Promise.resolve());
	ee.on(Emittery.listenerAdded, ({ eventName, listener }) => {});
	ee.on(Emittery.listenerRemoved, ({ eventName, listener }) => {});
	const off = ee.on("anEvent", () => undefined);
	off();
}

// off
{
	const ee = new Emittery();
	ee.off("anEvent", () => undefined);
	ee.off("anEvent", () => Promise.resolve());
	ee.off("anEvent", data => undefined);
	ee.off("anEvent", data => Promise.resolve());
}

{
	const ee = new Emittery();
	expectError(ee.emit("anEvent", "some data", "and more"));
}

{
	const ee = new Emittery();
	expectError(ee.on("anEvent", (data: any, more: any) => undefined));
}

// Strict typing for emission
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
	}>();
	ee.emit("open");
	ee.emit("close");
	ee.emit("value", "test");
	expectError(ee.emit("value"));
	expectError(ee.emit("open", "test"));
}

// Strict typing for listeners
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
	}>();
	ee.on("open", () => {});
	ee.on("open", argument => {
		expectType<undefined>(argument);
	});

	ee.on("value", () => {});
	ee.on("value", argument => {
		expectType<string>(argument);
	});

	const listener = (value: string) => undefined;
	ee.on("value", listener);
	ee.off("value", listener);
	ee.once("value").then(listener);

	expectError(ee.on("value", (value: number) => {}));
}

// Strict typing for onAny, offAny listeners
{
	const ee = new Emittery<{
		value: string;
		open: undefined;
		close: undefined;
		other: number;
	}>();

	ee.onAny((name, data) => {
		expectType<"value" | "open" | "close" | "other">(name);
		expectType<string | number | undefined>(data);
	});

	const listener = (name: string) => {};
	ee.onAny(listener);
	ee.offAny(listener);
}

// Strict typing for onAny, offAny listeners for an Emittery that only has listeners with arguments
{
	const ee = new Emittery<{
		value: string;
		other: number;
	}>();

	ee.onAny((name, data) => {
		expectType<"value" | "other">(name);
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
			expectType<"value" | "open" | "close">(event[0]);

			expectType<string | undefined>(event[1]);
		}

		const ee2 = new Emittery<{
			value: string;
			other: number;
		}>();

		for await (const event of ee2.anyEvent()) {
			expectType<"value" | "other">(event[0]);
			expectType<string | number>(event[1]);
		}
	};
}
