'use strict';
const vm = require('vm');

const syntax = require('babel-plugin-syntax-async-generators');
const transform = require('babel-plugin-transform-async-to-generator');

try {
	new vm.Script('async () => { for await (const _ of []) {} }'); // eslint-disable-line no-new
	module.exports = {plugins: [syntax]};
} catch (err) {
	module.exports = {plugins: [syntax, transform]};
}
