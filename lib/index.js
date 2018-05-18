// Native
const path = require('path');

// Packages
const url = require('fast-url-parser');
const fs = require('fs-extra');
const slasher = require('glob-slasher');
const pathToRegExp = require('path-to-regexp');

const getHandlers = methods => {
	const {createReadStream} = fs;

	return Object.assign({
		createReadStream
	}, methods);
};

const toRegExp = (location, keys = null) => {
	const normalized = slasher(location).replace('*', '(.*)');
	return pathToRegExp(normalized, keys);
};

const applyRewrites = (requestPath, rewrites) => {
	if (!Array.isArray(rewrites)) {
		return requestPath;
	}

	const rewrite = rewrites.find(({source}) => toRegExp(source).test(requestPath));

	if (rewrite) {
		return applyRewrites(slasher(rewrite.destination), rewrites);
	}

	return requestPath;
};

const applyRedirect = (rewrittenURL, redirects) => {
	if (!Array.isArray(redirects)) {
		return null;
	}

	// This is currently the fastest way to
	// iterate over an array
	for (let index = 0; index < redirects.length; index++) {
		const {destination, source, statusCode} = redirects[index];

		const keys = [];
		const expression = toRegExp(source, keys);
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

	const {pathname} = url.parse(request.url);
	const rewrittenURL = applyRewrites(pathname, config.rewrites);
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
