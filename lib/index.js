// Native
const path = require('path');

// Packages
const url = require('fast-url-parser');
const fs = require('fs-extra');
const slasher = require('glob-slasher');
const minimatch = require('minimatch');
const pathToRegExp = require('path-to-regexp');
const mime = require('mime/lite');

const getHandlers = methods => {
	const {stat, createReadStream} = fs;

	return Object.assign({
		stat,
		createReadStream
	}, methods);
};

const sourceMatches = (source, requestPath, allowSegments) => {
	const keys = [];
	const slashed = slasher(source);

	let results = null;

	if (allowSegments) {
		const normalized = slashed.replace('*', '(.*)');
		const expression = pathToRegExp(normalized, keys);

		results = expression.exec(requestPath);
	}

	if (results || minimatch(requestPath, slashed)) {
		return {
			keys,
			results
		};
	}

	return null;
};

const toTarget = (source, destination, previousPath) => {
	const matches = sourceMatches(source, previousPath, true);

	if (!matches) {
		return null;
	}

	const {keys, results} = matches;

	const props = {};
	const {protocol} = url.parse(destination);
	const normalizedDest = protocol ? destination : slasher(destination);
	const toPath = pathToRegExp.compile(normalizedDest);

	for (let index = 0; index < keys.length; index++) {
		const {name} = keys[index];
		props[name] = results[index + 1];
	}

	return toPath(props);
};

const applyRewrites = (requestPath, rewrites = []) => {
	if (rewrites.length === 0) {
		return requestPath;
	}

	for (let index = 0; index < rewrites.length; index++) {
		const {source, destination} = rewrites[index];
		const target = toTarget(source, destination, requestPath);

		if (target) {
			return applyRewrites(slasher(target), rewrites);
		}
	}

	return requestPath;
};

const applyRedirect = (rewrittenURL, redirects = []) => {
	if (redirects.length === 0) {
		return null;
	}

	// This is currently the fastest way to
	// iterate over an array
	for (let index = 0; index < redirects.length; index++) {
		const {source, destination, statusCode} = redirects[index];
		const target = toTarget(source, destination, rewrittenURL);

		if (target) {
			return {
				target,
				statusCode: statusCode || 301
			};
		}
	}

	return null;
};

const appendHeaders = (target, source) => {
	for (let index = 0; index < source.length; index++) {
		const {key, value} = source[index];
		target[key] = value;
	}
};

const getHeaders = async (handlers, customHeaders = [], {relative, absolute}) => {
	const related = {};

	if (customHeaders.length > 0) {
		// By iterating over all headers and never stopping, developers
		// can specify multiple header sources in the config that
		// might match a single path.
		for (let index = 0; index < customHeaders.length; index++) {
			const {source, headers} = customHeaders[index];

			if (sourceMatches(source, relative)) {
				appendHeaders(related, headers);
			}
		}
	}

	const stats = await handlers.stat(absolute);

	const defaultHeaders = {
		'Content-Type': mime.getType(relative),
		'Last-Modified': stats.mtime.toUTCString(),
		'Content-Length': stats.size
	};

	return Object.assign(defaultHeaders, related);
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
		const headers = await getHeaders(handlers, config.headers, {
			relative: rewrittenURL,
			absolute: related
		});

		response.writeHead(200, headers);
		handlers.createReadStream(related).pipe(response);

		return;
	}

	response.statusCode = 404;
	response.end('Not Found');
};
