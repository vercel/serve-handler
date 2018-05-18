// Native
const path = require('path');

// Packages
const url = require('fast-url-parser');
const fs = require('fs-extra');
const minimatch = require('minimatch');
const slasher = require('glob-slasher');

const getHandlers = methods => {
	const {createReadStream} = fs;

	return Object.assign({
		createReadStream
	}, methods);
};

const applyRewrites = (requestURL, rewrites) => {
	const {pathname} = url.parse(requestURL);

	if (!Array.isArray(rewrites)) {
		return pathname;
	}

	const rewrite = rewrites.find(({source}) => minimatch(pathname, slasher(source)));

	if (rewrite) {
		return slasher(rewrite.destination);
	}

	return pathname;
};

module.exports = async (request, response, config = {}, methods) => {
	const cwd = process.cwd();
	const current = config.path ? path.join(cwd, config.path) : cwd;
	const handlers = getHandlers(methods);

	const rewrittenURL = applyRewrites(request.url, config.rewrites);
	const related = decodeURIComponent(path.join(current, rewrittenURL));

	const relatedExists = await fs.exists(related);

	if (relatedExists) {
		handlers.createReadStream(related).pipe(response);
		return;
	}

	response.statusCode = 404;
	response.end('Not Found');
};
