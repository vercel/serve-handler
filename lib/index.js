// Native
const url = require('url');
const path = require('path');

// Packages
const mime = require('mime/lite');
const fs = require('fs-extra');

const getHandlers = methods => {
	const {createReadStream} = fs;

	return Object.assign({
		createReadStream
	}, methods);
};

module.exports = async (request, response, config = {}, methods) => {
	const cwd = process.cwd();
	const current = config.path ? path.join(cwd, config.path) : cwd;
	const handlers = getHandlers(methods);

	const {pathname} = url.parse(request.url);
	const related = decodeURIComponent(path.join(current, pathname));

	const relatedExists = await fs.exists(related);

	if (relatedExists) {
		handlers.createReadStream(related).pipe(response);
		return;
	}

	response.statusCode = 404;
	response.end('Not Found');
};
