import {readdirSync, statSync} from 'fs';
import {resolve as _resolve, join, extname, relative} from 'path';
import pkgUp from 'pkg-dir';

import test from 'ava';
import * as ts from 'typescript';

const resolve = _resolve.bind(null, __dirname);
const validExtension = new Set(['.js', '.ts']);
const compilerOptions = {
	target: ts.ScriptTarget.ES2017,
	module: ts.ModuleKind.CommonJS,
	strict: true,
	noEmit: true
};

test('TS can compile valid Emittery method calls [slow]', assertAllCompile, './fixtures/compiles');
test('TS warns about invalid Emittery method calls [slow]', assertEachFail, './fixtures/fails');

function assertAllCompile(t, srcDir) {
	const fileNames = listFiles(resolve(srcDir));
	const errors = compile(fileNames);

	t.is(errors.length, 0, errorMessage(errors));
}

function assertEachFail(t, srcDir) {
	const fileNames = listFiles(resolve(srcDir)).sort();
	const errors = compile(fileNames);
	const filesWithErrors = errors
		.map(err => (err.file ? err.file.fileName : null))
		.filter(Boolean);

	t.deepEqual(new Set(filesWithErrors), new Set(fileNames), 'Some files did not emit any compile error.');
	t.snapshot(errorMessage(errors));
}

function listFiles(srcRoot) {
	return readdirSync(srcRoot)
		.filter(hasValidExtension)
		.map(name => join(srcRoot, name))
		.filter(isFile);
}

function compile(fileNames, options = compilerOptions) {
	const program = ts.createProgram(fileNames, options);
	const emitResult = program.emit();

	return ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
}

function errorMessage(diagnosticList) {
	const root = pkgUp.sync();

	return diagnosticList.map(diagnostic => {
		if (!diagnostic.file) {
			return `${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
		}

		const {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
		const fileName = relative(root, diagnostic.file.fileName);

		return `${fileName} (${line + 1},${character + 1}): ${message}`;
	}).join('\n');
}

function isFile(path) {
	return statSync(path).isFile();
}

function hasValidExtension(path) {
	return validExtension.has(extname(path));
}
