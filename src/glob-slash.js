<<<<<<< HEAD
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
=======
/*! The MIT License (MIT) Copyright (c) 2014 Scott Corgan */

// This is adopted from https://github.com/scottcorgan/glob-slash/

var path = require('path');
var exports = module.exports = slashGlob;

exports.normalize = normalize;

function slashGlob (value) {
  if (value.charAt(0) === '!') {
    return '!' + exports.normalize(value.substr(1));
  }

  return exports.normalize(value);
};

function normalize (value) {
  return path.posix.normalize(path.posix.join('/', value));
};
>>>>>>> f980578217ce741b76ce07075ca7dea20c6415a2
