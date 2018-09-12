/* ! The MIT License (MIT) Copyright (c) 2014 Scott Corgan */

// This is adopted from https://github.com/scottcorgan/glob-slash/

const path = require('path');

function normalize(value) {
	return path.posix.normalize(path.posix.join('/', value));
}

function slashGlob(value) {
	if (value.charAt(0) === '!') {
		return `!${normalize(value.substr(1))}`;
	}

	return normalize(value);
}

module.exports = slashGlob;
module.exports.normalize = normalize;
