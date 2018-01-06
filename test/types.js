import path from 'path';

import test from 'ava';
import glob from 'glob';

// Import syntax trips up Atom with ide-typescript loaded.
const ts = require('typescript');

const compilerOptions = {
	target: ts.ScriptTarget.ES2017,
	module: ts.ModuleKind.CommonJS,
	strict: true,
	noEmit: true
};

test('TS can compile valid Emittery method calls', assertAllCompile, 'test/fixtures/compiles');
test('TS warns about invalid Emittery method calls', assertEachFail, 'test/fixtures/fails');

function assertAllCompile(t, srcDir) {
	const fileNames = listFiles(srcDir);
	const errors = compile(fileNames);

	t.is(errors.length, 0, errorMessage(errors));
}

function assertEachFail(t, srcDir) {
	const fileNames = listFiles(srcDir).sort();
	const errors = compile(fileNames);
	const filesWithErrors = errors
		.map(err => (err.file ? err.file.fileName : null))
		.filter(Boolean);

	t.deepEqual(new Set(filesWithErrors), new Set(fileNames), 'Some files did not emit any compile error.');
	t.snapshot(errorMessage(errors));
}

function listFiles(srcRoot) {
	return glob.sync('{*.js,*.ts}', {
		cwd: path.resolve(srcRoot),
		absolute: true
	});
}

function compile(fileNames, options = compilerOptions) {
	const program = ts.createProgram(fileNames, options);
	const emitResult = program.emit();

	return ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
}

function errorMessage(diagnosticList) {
	return diagnosticList.map(diagnostic => {
		if (!diagnostic.file) {
			return `${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
		}

		const {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
		const fileName = path.relative(process.cwd(), diagnostic.file.fileName);

		return `${fileName} (${line + 1},${character + 1}): ${message}`;
	}).join('\n');
}
