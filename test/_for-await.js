'use strict';
const vm = require('vm');

try {
	vm.runInNewContext('async () => { for await (const _ of []) {} }');
	module.exports = require('babel-plugin-syntax-async-generators');
} catch (err) {
	module.exports = require('babel-plugin-transform-async-generator-functions');
}
