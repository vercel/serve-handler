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

const shouldRedirect = (rewrittenPath, {redirects = [], trailingSlash = null}) => {
	if (redirects.length === 0) {
		return null;
	}

	const defaultType = 301;

	if (typeof trailingSlash === 'boolean') {
		const {ext} = path.parse(rewrittenPath);
		const isTrailed = rewrittenPath.endsWith('/');

		let target = null;

		if (!trailingSlash && isTrailed) {
			target = rewrittenPath.slice(0, -1);
		} else if (trailingSlash && !isTrailed && !ext) {
			target = `${rewrittenPath}/`;
		}

		if (rewrittenPath.indexOf('//') > -1) {
			target = rewrittenPath.replace(/\/+/g, '/');
		}

		if (target) {
			return {
				target,
				statusCode: defaultType
			};
		}
	}

	// This is currently the fastest way to
	// iterate over an array
	for (let index = 0; index < redirects.length; index++) {
		const {source, destination, type} = redirects[index];
		const target = toTarget(source, destination, rewrittenPath);

		if (target) {
			return {
				target,
				statusCode: type || defaultType
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

const getHeaders = async (handlers, customHeaders = [], relativePath, stats) => {
	const related = {};

	if (customHeaders.length > 0) {
		// By iterating over all headers and never stopping, developers
		// can specify multiple header sources in the config that
		// might match a single path.
		for (let index = 0; index < customHeaders.length; index++) {
			const {source, headers} = customHeaders[index];

			if (sourceMatches(source, relativePath)) {
				appendHeaders(related, headers);
			}
		}
	}

	const defaultHeaders = {
		'Content-Type': mime.getType(relativePath),
		'Last-Modified': stats.mtime.toUTCString(),
		'Content-Length': stats.size
	};

	return Object.assign(defaultHeaders, related);
};

module.exports = async (request, response, config = {}, methods = {}) => {
	const cwd = process.cwd();
	const current = config.public ? path.join(cwd, config.public) : cwd;
	const handlers = getHandlers(methods);

	const decodedPath = decodeURIComponent(url.parse(request.url).pathname);
	const relativePath = applyRewrites(decodedPath, config.rewrites);
	const redirect = shouldRedirect(decodedPath, config);

	if (redirect) {
		response.writeHead(redirect.statusCode, {
			Location: redirect.target
		});

		response.end();
	}

	const absolutePath = path.join(current, relativePath);
	let stats = null;

	try {
		stats = await handlers.stat(absolutePath);
	} catch (err) {
		if (err.code !== 'ENOENT') {
			response.statusCode = 500;
			response.end(err.message);

			return;
		}
	}

	if (!stats) {
		response.statusCode = 404;
		response.end('Not Found');

		return;
	}

	const headers = await getHeaders(handlers, config.headers, relativePath, stats);

	if (stats.isFile()) {
		response.writeHead(200, headers);
		handlers.createReadStream(absolutePath).pipe(response);

		return;
	}

	response.statusCode = 200;
	response.end('Directory');
};
