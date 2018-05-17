// Native
const url = require('url');
const path = require('path');

// Packages
const isPathInside = require('path-is-inside');
const fs = require('fs-extra');
const micro = require('micro');

module.exports = async (request, response, config = {}, handlers) => {
	let current = process.cwd();

	if (config.path) {
		current = path.join(current, config.path);
	}

	const {pathname} = url.parse(request.url);
	const related = decodeURIComponent(path.join(current, pathname));

	const isSame = related === current;

	if (!isSame && !isPathInside(related, current)) {
		micro.send(response, 400, 'Bad Request');
		return;
	}

	const relatedExists = await fs.exists(related);

	if (relatedExists) {
		console.log(handlers);
	}

	console.log(related);
	micro.send(response, 404, 'Not Found');
};
