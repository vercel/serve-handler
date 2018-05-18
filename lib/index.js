// Native
const path = require('path');

// Packages
const url = require('fast-url-parser');
const fs = require('fs-extra');
const minimatch = require('minimatch');
const slasher = require('glob-slasher');
const toRegExp = require('path-to-regexp');

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

const applyRedirect = (rewrittenURL, redirects) => {
	if (!Array.isArray(redirects)) {
		return null;
	}

	// This is currently the fastest way to
	// iterate over an array
	for (let index = 0; index < redirects.length; index++) {
		const {destination, source, statusCode} = redirects[index];
		const normalized = slasher(source).replace('*', '(.*)');

		const keys = [];
		const expression = toRegExp(normalized, keys);
		const results = expression.exec(rewrittenURL);

		if (results) {
			const props = {};
			const {protocol} = url.parse(destination);
			const normalizedDest = protocol ? destination : slasher(destination);
			const toPath = toRegExp.compile(normalizedDest);

			for (let i = 0; i < keys.length; i++) {
				const {name} = keys[i];
				props[name] = results[index + 1];
			}

			return {
				target: toPath(props),
				statusCode: statusCode || 301
			};
		}
	}
};

module.exports = async (request, response, config = {}, methods) => {
	const cwd = process.cwd();
	const current = config.path ? path.join(cwd, config.path) : cwd;
	const handlers = getHandlers(methods);

	const rewrittenURL = applyRewrites(request.url, config.rewrites);
	const redirect = applyRedirect(rewrittenURL, config.redirects);

	if (redirect) {
		response.writeHead(redirect.statusCode, {
			Location: redirect.target
		});

		response.end();
	}

	const related = decodeURIComponent(path.join(current, rewrittenURL));
	const relatedExists = await fs.exists(related);

	if (relatedExists) {
		handlers.createReadStream(related).pipe(response);
		return;
	}

	response.statusCode = 404;
	response.end('Not Found');
};
