'use strict';
module.exports = function (eventName) {
	if (typeof eventName !== 'string') {
		throw new TypeError('eventName must be a string');
	}
};
