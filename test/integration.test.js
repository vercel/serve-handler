// Native
const path = require('path');

// Packages
const listen = require('test-listen');
const micro = require('micro');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const sleep = require('sleep-promise');

// Utilities
const handler = require('../src');
const errorTemplate = require('../src/error');

const fixturesTarget = 'test/fixtures';
const fixturesFull = path.join(process.cwd(), fixturesTarget);

const getUrl = (customConfig, handlers) => {
	const config = Object.assign({
		'public': fixturesTarget
	}, customConfig);

	const server = micro(async (request, response) => {
		await handler(request, response, config, handlers);
	});

	return listen(server);
};

const getDirectoryContents = async (location, sub, exclude = []) => {
	const excluded = [
		'.DS_Store',
		'.git',
		...exclude
	];

	const content = await fs.readdir(location || fixturesFull);

	if (sub) {
		content.unshift('..');
	}

	return content.filter(item => !excluded.includes(item));
};

test('render html directory listing', async () => {
	const contents = await getDirectoryContents();

	const url = await getUrl();
	const response = await fetch(url);
	const text = await response.text();

	const type = response.headers.get('content-type');

	expect(type).toBe('text/html; charset=utf-8');
	expect(contents.every(item => text.includes(item))).toBe(true);
});

test('render json directory listing', async () => {
	const contents = await getDirectoryContents();
	const url = await getUrl();

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	expect(type).toBe('application/json; charset=utf-8');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	expect(existing).toBe(true);
});

test('render html sub directory listing', async () => {
	const name = 'special-directory';

	const sub = path.join(fixturesFull, name);
	const contents = await getDirectoryContents(sub, true);
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	const type = response.headers.get('content-type');
	expect(type).toBe('text/html; charset=utf-8');

	expect(contents.every(item => text.includes(item))).toBe(true);
});

test('render json sub directory listing', async () => {
	const name = 'special-directory';

	const sub = path.join(fixturesFull, name);
	const contents = await getDirectoryContents(sub, true);
	const url = await getUrl();

	const response = await fetch(`${url}/${name}`, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	expect(type).toBe('application/json; charset=utf-8');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	expect(existing).toBe(true);
});

test('render json sub directory listing with custom stat handler', async () => {
	const name = 'special-directory';

	const sub = path.join(fixturesFull, name);
	const contents = await getDirectoryContents(sub, true);

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: (location, isDirectoryListing) => {
			if (contents.includes(path.basename(location))) {
				expect(isDirectoryListing).toBe(true);
			} else {
				expect(isDirectoryListing).toBeFalsy();
			}

			return fs.lstat(location);
		}
	});

	const response = await fetch(`${url}/${name}`, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	expect(type).toBe('application/json; charset=utf-8');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	expect(existing).toBe(true);
});

test('render dotfile', async () => {
	const name = '.dotfile';
	const related = path.join(fixturesFull, name);

	const content = await fs.readFile(related, 'utf8');
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	expect(content).toEqual(text);
});

test('render json file', async () => {
	const name = 'object.json';
	const related = path.join(fixturesFull, name);

	const content = await fs.readJSON(related);
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);

	const type = response.headers.get('content-type');
	expect(type).toBe('application/json; charset=utf-8');

	const text = await response.text();
	const spec = JSON.parse(text);

	expect(spec).toEqual(content);
});

test('try to render non-existing json file', async () => {
	const name = 'mask-off.json';
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);

	const type = response.headers.get('content-type');

	expect(type).toBe('text/html; charset=utf-8');
	expect(response.status).toBe(404);
});

test('try to render non-existing json file and `stat` errors', async () => {
	const name = 'mask-off.json';
	const message = 'I am an error';

	let done = null;

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: location => {
			if (path.basename(location) === name && !done) {
				done = true;
				throw new Error(message);
			}

			return fs.lstat(location);
		}
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	expect(response.status).toBe(500);

	const content = errorTemplate({
		statusCode: 500,
		message: 'A server error has occurred'
	});

	expect(text).toBe(content);
});

test('set `trailingSlash` config property to `true`', async () => {
	const url = await getUrl({
		trailingSlash: true
	});

	const target = `${url}/test`;

	const response = await fetch(target, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${target}/`);
});

test('set `trailingSlash` config property to any boolean and remove multiple slashes', async () => {
	const url = await getUrl({
		trailingSlash: true
	});

	const target = `${url}/test/`;

	const response = await fetch(`${target}//////`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(target);
});

test('set `trailingSlash` config property to `false`', async () => {
	const url = await getUrl({
		trailingSlash: false
	});

	const target = `${url}/test`;

	const response = await fetch(`${target}/`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(target);
});

test('set `cleanUrls` config property should prevent open redirects', async () => {
	const url = await getUrl({
		cleanUrls: true
	});

	const response = await fetch(`${url}//haveibeenpwned.com/index`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}/haveibeenpwned.com`);
});

test('set `rewrites` config property to wildcard path', async () => {
	const destination = '.dotfile';
	const related = path.join(fixturesFull, destination);
	const content = await fs.readFile(related, 'utf8');

	const url = await getUrl({
		rewrites: [{
			source: 'face/**',
			destination
		}]
	});

	const response = await fetch(`${url}/face/delete`);
	const text = await response.text();

	expect(text).toBe(content);
});

test('set `rewrites` config property to non-matching path', async () => {
	const destination = '404.html';
	const related = path.join(fixturesFull, destination);
	const content = await fs.readFile(related, 'utf8');

	const url = await getUrl({
		rewrites: [{
			source: 'face/**',
			destination
		}]
	});

	const response = await fetch(`${url}/mask/delete`);
	const text = await response.text();

	expect(text).toBe(content);
});

test('set `rewrites` config property to one-star wildcard path', async () => {
	const destination = '.dotfile';
	const related = path.join(fixturesFull, destination);
	const content = await fs.readFile(related, 'utf8');

	const url = await getUrl({
		rewrites: [{
			source: 'face/*/mask',
			destination
		}]
	});

	const response = await fetch(`${url}/face/delete/mask`);
	const text = await response.text();

	expect(text).toBe(content);
});

test('set `rewrites` config property to path segment', async () => {
	const related = path.join(fixturesFull, 'object.json');
	const content = await fs.readJSON(related);

	const url = await getUrl({
		rewrites: [{
			source: 'face/:id',
			destination: ':id.json'
		}]
	});

	const response = await fetch(`${url}/face/object`);
	const json = await response.json();

	expect(json).toEqual(content);
});

test('set `redirects` config property to wildcard path', async () => {
	const destination = 'testing';

	const url = await getUrl({
		redirects: [{
			source: 'face/**',
			destination
		}]
	 });

	const response = await fetch(`${url}/face/mask`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}/${destination}`);
});

test('set `redirects` config property to a negated wildcard path', async () => {
	const destination = 'testing';

	const url = await getUrl({
		redirects: [{
			source: '!face/**',
			destination
		}]
	 });

	const responseTruthy = await fetch(`${url}/test/mask`, {
		redirect: 'manual',
		follow: 0
	});

	const locationTruthy = responseTruthy.headers.get('location');
	expect(locationTruthy).toBe(`${url}/${destination}`);

	const responseFalsy = await fetch(`${url}/face/mask`, {
		redirect: 'manual',
		follow: 0
	});

	const locationFalsy = responseFalsy.headers.get('location');
	expect(locationFalsy).toBeFalsy();
});

test('set `redirects` config property to wildcard path and do not match', async () => {
	const destination = 'testing';

	const url = await getUrl({
		redirects: [{
			source: 'face/**',
			destination
		}]
	 });

	const response = await fetch(`${url}/test/mask`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBeFalsy();
});

test('set `redirects` config property to one-star wildcard path', async () => {
	const destination = 'testing';

	const url = await getUrl({
		redirects: [{
			source: 'face/*/ideal',
			destination
		}]
	 });

	const response = await fetch(`${url}/face/mask/ideal`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}/${destination}`);
});

test('set `redirects` config property to extglob wildcard path', async () => {
	const destination = 'testing';

	const url = await getUrl({
		redirects: [{
			source: 'face/+(mask1|mask2)/ideal',
			destination
		}]
	 });

	const response = await fetch(`${url}/face/mask1/ideal`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}/${destination}`);
});

test('set `redirects` config property to path segment', async () => {
	const url = await getUrl({
		redirects: [{
			source: 'face/:segment',
			destination: 'mask/:segment'
		}]
	 });

	const response = await fetch(`${url}/face/me`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}/mask/me`);
});

test('set `redirects` config property to wildcard path and `trailingSlash` to `true`', async () => {
	const target = '/face/mask';

	const url = await getUrl({
		trailingSlash: true,
		redirects: [{
			source: 'face/**',
			destination: 'testing'
		}]
	 });

	const response = await fetch(url + target, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url + target}/`);
});

test('set `redirects` config property to wildcard path and `trailingSlash` to `false`', async () => {
	const target = '/face/mask';

	const url = await getUrl({
		trailingSlash: false,
		redirects: [{
			source: 'face/**',
			destination: 'testing'
		}]
	 });

	const response = await fetch(`${url + target}/`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(url + target);
});

test('pass custom handlers', async () => {
	const name = '.dotfile';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: fs.lstat,
		createReadStream: fs.createReadStream
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();
	const content = await fs.readFile(path.join(fixturesFull, name), 'utf8');

	expect(text).toBe(content);
});

test('set `headers` to wildcard headers', async () => {
	const key = 'Cache-Control';
	const value = 'max-age=7200';

	const list = [{
		source: '*.md',
		headers: [{
			key,
			value
		}]
	}];

	const url = await getUrl({
		headers: list
	});

	const response = await fetch(`${url}/docs.md`);
	const cacheControl = response.headers.get(key);

	expect(cacheControl).toBe(value);
});

test('set `headers` to fixed headers and check default headers', async () => {
	const key = 'Cache-Control';
	const value = 'max-age=7200';

	const list = [{
		source: 'object.json',
		headers: [{
			key,
			value
		}]
	}];

	const url = await getUrl({
		headers: list
	});

	const {headers} = await fetch(`${url}/object.json`);
	const cacheControl = headers.get(key);
	const type = headers.get('content-type');

	expect(cacheControl).toBe(value);
	expect(type).toBe('application/json; charset=utf-8');
});

test('receive not found error', async () => {
	const url = await getUrl({
		'public': path.join(fixturesFull, 'directory')
	});

	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	const content = errorTemplate({
		statusCode: 404,
		message: 'The requested path could not be found'
	});

	expect(text).toBe(content);
});

test('receive not found error as json', async () => {
	const url = await getUrl();

	const response = await fetch(`${url}/not-existing`, {
		headers: {
			Accept: 'application/json'
		}
	});

	const json = await response.json();

	expect(json).toEqual({
		error: {
			code: 'not_found',
			message: 'The requested path could not be found'
		}
	});
});

test('receive custom `404.html` error page', async () => {
	const url = await getUrl();
	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	expect(text.trim()).toBe('<span>Not Found</span>');
});

test('error is still sent back even if reading `404.html` failed', async () => {
	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: location => {
			if (path.basename(location) === '404.html') {
				throw new Error('Any error occured while checking the file');
			}

			return fs.lstat(location);
		}
	});

	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	expect(response.status).toBe(404);

	const content = errorTemplate({
		statusCode: 404,
		message: 'The requested path could not be found'
	});

	expect(text).toBe(content);
});

test('disabled directory listing', async () => {
	const url = await getUrl({
		directoryListing: false
	});

	const response = await fetch(url);
	const text = await response.text();

	expect(response.status).toBe(404);
	expect(text.trim()).toBe('<span>Not Found</span>');
});

test('listing the directory failed', async () => {
	const message = 'Internal Server Error';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		readdir: () => {
			throw new Error(message);
		}
	});

	const response = await fetch(url);
	const text = await response.text();

	expect(response.status).toBe(500);

	const content = errorTemplate({
		statusCode: 500,
		message: 'A server error has occurred'
	});

	expect(text).toBe(content);
});

test('set `cleanUrls` config property to `true`', async () => {
	const target = 'directory';
	const index = path.join(fixturesFull, target, 'index.html');

	const url = await getUrl({
		cleanUrls: true
	});

	const response = await fetch(`${url}/${target}`);
	const content = await fs.readFile(index, 'utf8');
	const text = await response.text();

	expect(content).toBe(text);
});

test('set `cleanUrls` config property to array', async () => {
	const target = 'directory';
	const index = path.join(fixturesFull, target, 'index.html');

	const url = await getUrl({
		cleanUrls: [
			'/directory**'
		]
	});

	const response = await fetch(`${url}/${target}`);
	const content = await fs.readFile(index, 'utf8');
	const text = await response.text();

	expect(content).toBe(text);
});

test('set `cleanUrls` config property to empty array', async () => {
	const name = 'directory';

	const sub = path.join(fixturesFull, name);
	const contents = await getDirectoryContents(sub, true);

	const url = await getUrl({
		cleanUrls: []
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	const type = response.headers.get('content-type');
	expect(type).toBe('text/html; charset=utf-8');

	expect(contents.every(item => text.includes(item))).toBe(true);
});

test('set `cleanUrls` config property to `true` and try with file', async () => {
	const target = '/directory/clean-file';

	const url = await getUrl({
		cleanUrls: true
	});

	const response = await fetch(`${url}${target}.html`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}${target}`);
});

test('set `cleanUrls` config property to `true` and not index file found', async () => {
	const contents = await getDirectoryContents();
	const url = await getUrl({cleanUrls: true});

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	expect(type).toBe('application/json; charset=utf-8');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	expect(existing).toBe(true);
});

test('set `cleanUrls` config property to `true` and an error occurs', async () => {
	const target = 'directory';
	const message = 'Internal Server Error';

	const url = await getUrl({
		cleanUrls: true
	}, {
		lstat: location => {
			if (path.basename(location) === 'index.html') {
				throw new Error(message);
			}

			return fs.lstat(location);
		}
	});

	const response = await fetch(`${url}/${target}`);
	const text = await response.text();

	expect(response.status).toBe(500);

	const content = errorTemplate({
		statusCode: 500,
		message: 'A server error has occurred'
	});

	expect(text).toBe(content);
});

test('error occurs while getting stat of path', async () => {
	const message = 'Internal Server Error';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: location => {
			if (path.basename(location) !== '500.html') {
				throw new Error(message);
			}
		}
	});

	const response = await fetch(url);
	const text = await response.text();

	const content = errorTemplate({
		statusCode: 500,
		message: 'A server error has occurred'
	});

	expect(response.status).toBe(500);
	expect(text).toBe(content);
});

test('the first `lstat` call should be for a related file', async () => {
	let done = null;

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: location => {
			if (!done) {
				expect(path.basename(location)).toBe('index.html');
				done = true;
			}

			return fs.lstat(location);
		}
	});

	await fetch(url);
});

test('the `lstat` call should only be made for files and directories', async () => {
	const locations = [];

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: location => {
			locations.push(location);
			return fs.lstat(location);
		}
	});

	await fetch(url);

	expect(locations.some(location => path.basename(location) === '.html')).toBeFalsy();
});

test('error occurs while getting stat of not-found path', async () => {
	const message = 'Internal Server Error';
	const base = 'not-existing';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		lstat: location => {
			if (path.basename(location) === base) {
				throw new Error(message);
			}

			return fs.lstat(location);
		}
	});

	const response = await fetch(`${url}/${base}`);
	const text = await response.text();

	expect(response.status).toBe(500);

	const content = errorTemplate({
		statusCode: 500,
		message: 'A server error has occurred'
	});

	expect(text).toBe(content);
});

test('set `unlisted` config property to array', async () => {
	const unlisted = [
		'directory'
	];

	const contents = await getDirectoryContents(fixturesFull, null, unlisted);
	const url = await getUrl({unlisted});

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	expect(type).toBe('application/json; charset=utf-8');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	expect(existing).toBe(true);
});

test('set `createReadStream` handler to async function', async () => {
	const name = '.dotfile';
	const related = path.join(fixturesFull, name);
	const content = await fs.readFile(related, 'utf8');

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		createReadStream: async (file, opts) => {
			await sleep(2000);
			return fs.createReadStream(file, opts);
		}
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	expect(content).toEqual(text);
});

test('return mime type of the `rewrittenPath` if mime type of `relativePath` is null', async () => {
	const url = await getUrl({
		rewrites: [{
			source: '**',
			destination: 'clean-file.html'
		}]
	});

	const response = await fetch(`${url}/whatever`);
	const type = response.headers.get('content-type');

	expect(type).toBe('text/html; charset=utf-8');
});

test('error if trying to traverse path', async () => {
	const url = await getUrl();
	const response = await fetch(`${url}/../../test`);
	const text = await response.text();

	expect(response.status).toBe(400);

	const content = errorTemplate({
		statusCode: 400,
		message: 'Bad Request'
	});

	expect(text).toBe(content);
});

test('render file if directory only contains one', async () => {
	const directory = 'single-directory';
	const file = 'content.txt';
	const related = path.join(fixturesFull, directory, file);
	const content = await fs.readFile(related, 'utf8');

	const url = await getUrl({
		renderSingle: true
	});

	const response = await fetch(`${url}/${directory}`);
	const text = await response.text();

	expect(text).toBe(content);
});

test('correctly handle requests to /index if `cleanUrls` is enabled', async () => {
	const url = await getUrl();
	const target = `${url}/index`;

	const response = await fetch(target, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	expect(location).toBe(`${url}/`);
});

test('allow dots in `public` configuration property', async () => {
	const directory = 'public-folder.test';
	const root = path.join(fixturesTarget, directory);
	const file = path.join(fixturesFull, directory, 'index.html');

	const url = await getUrl({
		'public': root,
		'directoryListing': false
	});

	const response = await fetch(url);
	const text = await response.text();
	const content = await fs.readFile(file, 'utf8');

	expect(response.status).toBe(200);
	expect(content).toBe(text);
});

test('error for request with malformed URI', async () => {
	const url = await getUrl();
	const response = await fetch(`${url}/%E0%A4%A`);
	const text = await response.text();

	expect(response.status).toBe(400);

	const content = errorTemplate({
		statusCode: 400,
		message: 'Bad Request'
	});

	expect(text).toBe(content);
});

test('error responses get custom headers', async () => {
	const url = await getUrl({
		'public': path.join(fixturesTarget, 'single-directory'),
		'headers': [{
			source: '**',
			headers: [{
				key: 'who',
				value: 'me'
			}]
		}]
	});

	const response = await fetch(`${url}/non-existing`);
	const text = await response.text();

	expect(response.status).toBe(404);
	expect(response.headers.get('who')).toBe('me');

	const content = errorTemplate({
		statusCode: 404,
		message: 'The requested path could not be found'
	});

	expect(text).toBe(content);
});

test('modify config in `createReadStream` handler', async () => {
	const name = '.dotfile';
	const related = path.join(fixturesFull, name);
	const content = await fs.readFile(related, 'utf8');

	const config = {
		headers: []
	};

	const header = {
		key: 'X-Custom-Header',
		value: 'test'
	};

	const url = await getUrl(config, {
		createReadStream: async (file, opts) => {
			config.headers.unshift({
				source: name,
				headers: [header]
			});

			return fs.createReadStream(file, opts);
		}
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();
	const output = response.headers.get(header.key);

	expect(content).toEqual(text);
	expect(output).toEqual(header.value);
});

test('automatically handle ETag headers for normal files', async () => {
	const name = 'object.json';
	const related = path.join(fixturesFull, name);
	const content = await fs.readJSON(related);
	const value = '"d2ijdjoi29f3h3232"';

	const url = await getUrl({
		headers: [{
			source: '**',
			headers: [{
				key: 'ETag',
				value
			}]
		}]
	});

	const response = await fetch(`${url}/${name}`);
	const {headers} = response;

	const type = headers.get('content-type');
	const eTag = headers.get('etag');

	expect(type).toBe('application/json; charset=utf-8');
	expect(eTag).toBe(value);

	const text = await response.text();
	const spec = JSON.parse(text);

	expect(spec).toEqual(content);

	const cacheResponse = await fetch(`${url}/${name}`, {
		headers: {
			'if-none-match': value
		}
	});

	expect(cacheResponse.status).toBe(304);
});

test('range request without size', async () => {
	const name = 'docs.md';
	const related = path.join(fixturesFull, name);
	const content = await fs.readFile(related);

	const config = {
		headers: []
	};

	const url = await getUrl(config, {
		lstat: async location => {
			const stats = await fs.lstat(location);

			config.headers.unshift({
				source: '*',
				headers: [
					{
						key: 'Content-Length',
						value: stats.size
					}
				]
			});

			stats.size = null;
			return stats;
		}
	});

	const response = await fetch(`${url}/${name}`, {
		headers: {
			Range: 'bytes=0-10'
		}
	});

	const range = response.headers.get('content-range');
	const length = Number(response.headers.get('content-length'));

	expect(range).toBe(null);

	// The full document is sent back
	expect(length).toBe(27);
	expect(response.status).toBe(200);

	const text = await response.text();
	expect(text).toBe(content.toString());
});

test('range request', async () => {
	const name = 'docs.md';
	const related = path.join(fixturesFull, name);

	const content = await fs.readFile(related);
	const url = await getUrl();

	const response = await fetch(`${url}/${name}`, {
		headers: {
			Range: 'bytes=0-10'
		}
	});

	const range = response.headers.get('content-range');
	const length = Number(response.headers.get('content-length'));

	expect(range).toBe(`bytes 0-10/${content.length}`);
	expect(length).toBe(11);
	expect(response.status).toBe(206);

	const text = await response.text();
	const spec = content.toString().substr(0, 11);

	expect(text).toBe(spec);
});

test('range request not satisfiable', async () => {
	const name = 'docs.md';
	const related = path.join(fixturesFull, name);

	const content = await fs.readFile(related);
	const url = await getUrl();

	const response = await fetch(`${url}/${name}`, {
		headers: {
			Range: 'bytes=10-1'
		}
	});

	const range = response.headers.get('content-range');
	const length = Number(response.headers.get('content-length'));

	expect(range).toBe(`bytes */${content.length}`);
	expect(length).toBe(content.length);
	expect(response.status).toBe(416);

	const text = await response.text();
	const spec = content.toString();

	expect(text).toBe(spec);
});

test('remove header when null', async () => {
	const key = 'Cache-Control';
	const value = 'max-age=7200';

	const list = [{
		source: 'object.json',
		headers: [{
			key: key,
			value: value
		}, {
			key: key,
			value: null
		}]
	}];

	const url = await getUrl({
		headers: list
	});

	const {headers} = await fetch(`${url}/object.json`);
	const cacheControl = headers.get(key);

	expect(cacheControl).toBeFalsy();
});

test('errors in `createReadStream` get handled', async () => {
	const name = '.dotfile';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		createReadStream: () => {
			throw new Error('This is a test');
		}
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	const content = errorTemplate({
		statusCode: 500,
		message: 'A server error has occurred'
	});

	expect(content).toEqual(text);
	expect(response.status).toEqual(500);
});

test('log error when checking `404.html` failed', async () => {
	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		createReadStream: (location, opts) => {
			if (path.basename(location) === '404.html') {
				throw new Error('Any error occured while checking the file');
			}

			return fs.createReadStream(location, opts);
		}
	});

	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	expect(response.status).toBe(404);

	const content = errorTemplate({
		statusCode: 404,
		message: 'The requested path could not be found'
	});

	expect(text).toBe(content);
});

test('prevent access to parent directory', async () => {
	const url = await getUrl({
		rewrites: [
			{source: '/secret', destination: '/404.html'}
		]
	});

	const response = await fetch(`${url}/dir/../secret`);
	const text = await response.text();

	expect(text.trim()).toBe('<span>Not Found</span>');
});

test('symlinks should not work by default', async () => {
	const name = 'symlinks/package.json';
	const url = await getUrl();

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	expect(response.status).toBe(404);
	expect(text.trim()).toBe('<span>Not Found</span>');
});

test('allow symlinks by setting the option', async () => {
	const name = 'symlinks/package.json';
	const related = path.join(fixturesFull, name);
	const content = await fs.readFile(related);

	const url = await getUrl({
		symlinks: true
	});

	const response = await fetch(`${url}/${name}`);
	const length = Number(response.headers.get('content-length'));

	expect(length).toBe(content.length);
	expect(response.status).toBe(200);

	const text = await response.text();
	const spec = content.toString();

	expect(text).toBe(spec);
});

test('A bad symlink should be a 404', async () => {
	const name = 'symlinks/a-bad-link';

	const url = await getUrl({
		symlinks: true
	});

	const response = await fetch(`${url}/${name}`);
	expect(response.status).toBe(404);

	const text = await response.text();
	expect(text.trim()).toBe('<span>Not Found</span>');
});

test('etag header is set', async () => {
	const url = await getUrl({
		renderSingle: true,
		etag: true
	});

	let response = await fetch(`${url}/docs.md`);
	expect(response.status).toBe(200);
	expect(response.headers.get('etag')).toBe(
		'"60be4422531fce1513df34cbcc90bed5915a53ef"'
	);

	response = await fetch(`${url}/docs.txt`);
	expect(response.status).toBe(200);
	expect(response.headers.get('etag')).toBe(
		'"ba114dbc69e41e180362234807f093c3c4628f90"'
	);
});
