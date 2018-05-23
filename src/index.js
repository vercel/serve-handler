// Native
const path = require('path');

// Packages
const url = require('fast-url-parser');
const fs = require('fs-extra');
const slasher = require('glob-slasher');
const minimatch = require('minimatch');
const pathToRegExp = require('path-to-regexp');
const mime = require('mime/lite');
const bytes = require('bytes');

// Other
const template = require('./directory.js');

const getHandlers = methods => {
	const {stat, createReadStream, readdir} = fs;

	return Object.assign({
		stat,
		createReadStream,
		readdir
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

const shouldRedirect = (decodedPath, {redirects = [], trailingSlash}, cleanUrl) => {
	if (redirects.length === 0) {
		return null;
	}

	const defaultType = 301;
	const matchHTML = /.html|.htm|\/index/g;

	let cleanedUrl = false;

	// By stripping the HTML parts from the decoded
	// path *before* handling the trailing slash, we make
	// sure that only *one* redirect occurs if both
	// config options are used.
	if (cleanUrl && matchHTML.test(decodedPath)) {
		decodedPath = decodedPath.replace(matchHTML, '');
		cleanedUrl = true;
	}

	if (typeof trailingSlash === 'boolean') {
		const {ext, name} = path.parse(decodedPath);
		const isTrailed = decodedPath.endsWith('/');
		const isDotfile = name.startsWith('.');

		let target = null;

		if (!trailingSlash && isTrailed) {
			target = decodedPath.slice(0, -1);
		} else if (trailingSlash && !isTrailed && !ext && !isDotfile) {
			target = `${decodedPath}/`;
		}

		if (decodedPath.indexOf('//') > -1) {
			target = decodedPath.replace(/\/+/g, '/');
		}

		if (target) {
			return {
				target,
				statusCode: defaultType
			};
		}
	}

	if (cleanedUrl) {
		return {
			target: decodedPath,
			statusCode: defaultType
		};
	}

	// This is currently the fastest way to
	// iterate over an array
	for (let index = 0; index < redirects.length; index++) {
		const {source, destination, type} = redirects[index];
		const target = toTarget(source, destination, decodedPath);

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

const getHeaders = async (customHeaders = [], relativePath, stats) => {
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

const applicable = (decodedPath, configEntry, negative) => {
	let matches = negative ? false : true;

	if (typeof configEntry !== 'undefined') {
		matches = (configEntry === !negative);

		if (!matches && Array.isArray(configEntry)) {
			// This is much faster than `.some`
			for (let index = 0; index < configEntry.length; index++) {
				const source = configEntry[index];

				if (sourceMatches(source, decodedPath)) {
					matches = true;
				}
			}
		}
	}

	return matches;
};

const getPossiblePaths = (relativePath, extension) => [
	path.join(relativePath, `index${extension}`),
	relativePath.endsWith('/') ? relativePath.replace(/\/$/g, extension) : (relativePath + extension)
];

const findRelated = async (current, relativePath, stat, extension = '.html') => {
	const possible = getPossiblePaths(relativePath, extension);

	let stats = null;

	for (let index = 0; index < possible.length; index++) {
		const related = possible[index];
		const absolutePath = path.join(current, related);

		try {
			stats = await stat(absolutePath);
		} catch (err) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
		}

		if (stats) {
			return {
				stats,
				absolutePath
			};
		}
	}

	if (extension === '.htm') {
		return null;
	}

	// At this point, no `.html` files have been found, so we
	// need to check for the existance of `.htm` ones.
	const relatedHTM = findRelated(current, relativePath, stat, '.htm');

	if (relatedHTM) {
		return relatedHTM;
	}

	return null;
};

const canBeListed = (excluded, file) => {
	const slashed = slasher(file);
	let whether = true;

	for (let mark = 0; mark < excluded.length; mark++) {
		const source = excluded[mark];

		if (sourceMatches(source, slashed)) {
			whether = false;
			break;
		}
	}

	return whether;
};

const renderDirectory = async (current, relativePath, absolutePath, handlers, config) => {
	const {directoryListing, trailingSlash, unlisted = []} = config;
	const slashSuffix = typeof trailingSlash === 'boolean' ? (trailingSlash ? '/' : '') : '/';

	const excluded = [
		'.DS_Store',
		'.git',
		...unlisted
	];

	if (!applicable(relativePath, directoryListing, false)) {
		return null;
	}

	let files = await handlers.readdir(absolutePath);

	for (let index = 0; index < files.length; index++) {
		const file = files[index];

		const filePath = path.resolve(absolutePath, file);
		const details = path.parse(filePath);
		const stats = await handlers.stat(filePath);

		details.relative = path.join(relativePath, details.base);

		if (stats.isDirectory()) {
			details.base += slashSuffix;
			details.relative += slashSuffix;

			details.isDirectory = true;
		} else {
			details.ext = details.ext.split('.')[1] || 'txt';
			details.size = bytes(stats.size, {unitSeparator: ' '});
		}

		details.title = details.base;

		if (canBeListed(excluded, file)) {
			files[index] = details;
		} else {
			delete files[index];
		}
	}

	const toRoot = path.relative(current, absolutePath);
	const directory = path.join(path.basename(current), toRoot, slashSuffix);
	const pathParts = directory.split(path.sep).filter(Boolean);

	// Sort to list directories first, then sort alphabetically
	files = files.sort((a, b) => {
		const aIsDir = a.isDirectory;
		const bIsDir = b.isDirectory;

		if (aIsDir && !bIsDir) {
			return -1;
		}

		if (bIsDir && !aIsDir) {
			return 1;
		}

		if (a.base > b.base) {
			return 1;
		}

		if (a.base < b.base) {
			return -1;
		}

		return 0;
	}).filter(Boolean);

	// Add parent directory to the head of the sorted files array
	if (toRoot.length > 0) {
		const directoryPath = [...pathParts].slice(1);
		const relative = path.join('/', ...directoryPath, '..', slashSuffix);

		files.unshift({
			base: '..',
			relative,
			title: relative
		});
	}

	const paths = [];

	for (let index = 0; index < pathParts.length; index++) {
		const parents = [];
		const isLast = index === (pathParts.length - 1);

		let before = 0;

		while (before <= index) {
			parents.push(pathParts[before]);
			before++;
		}

		parents.shift();

		paths.push({
			name: pathParts[index] + (isLast ? slashSuffix : '/'),
			url: index === 0 ? '' : parents.join('/') + slashSuffix
		});
	}

	return template({
		files,
		directory,
		paths
	});
};

module.exports = async (request, response, config = {}, methods = {}) => {
	const cwd = process.cwd();
	const current = config.public ? path.join(cwd, config.public) : cwd;
	const handlers = getHandlers(methods);

	const decodedPath = decodeURIComponent(url.parse(request.url).pathname);
	const cleanUrl = applicable(decodedPath, config.cleanUrls, true);
	const redirect = shouldRedirect(decodedPath, config, cleanUrl);

	if (redirect) {
		response.writeHead(redirect.statusCode, {
			Location: redirect.target
		});

		response.end();
	}

	const relativePath = applyRewrites(decodedPath, config.rewrites);

	let absolutePath = path.join(current, relativePath);
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

	if (!stats || stats.isDirectory()) {
		if (cleanUrl) {
			try {
				const related = await findRelated(current, relativePath, handlers.stat);

				if (related) {
					({stats, absolutePath} = related);
				}
			} catch (err) {
				if (err.code !== 'ENOENT') {
					response.statusCode = 500;
					response.end(err.message);

					return;
				}
			}
		}

		if (!stats) {
			response.statusCode = 404;
			response.end('Not Found');

			return;
		}
	}

	const headers = await getHeaders(config.headers, relativePath, stats);

	if (stats.isFile()) {
		response.writeHead(200, headers);
		handlers.createReadStream(absolutePath).pipe(response);

		return;
	}

	let directory = null;

	try {
		directory = await renderDirectory(current, relativePath, absolutePath, handlers, config);
	} catch (err) {
		response.statusCode = 500;
		response.end(err.message);

		return;
	}

	response.statusCode = directory ? 200 : 404;
	response.end(directory || 'Not Found');
};
