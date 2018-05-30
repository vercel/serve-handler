// Native
const path = require('path');

// Packages
const test = require('ava');
const listen = require('test-listen');
const micro = require('micro');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const sleep = require('sleep-promise');

// Utilities
const handler = require('../');

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

const getDirectoryContents = async (location = fixturesFull, sub, exclude = []) => {
	const excluded = [
		'.DS_Store',
		'.git',
		...exclude
	];

	const content = await fs.readdir(location);

	if (sub) {
		content.unshift('..');
	}

	return content.filter(item => !excluded.includes(item));
};

test('render html directory listing', async t => {
	const contents = await getDirectoryContents();

	const url = await getUrl();
	const response = await fetch(url);
	const text = await response.text();

	const type = response.headers.get('content-type');

	t.is(type, 'text/html; charset=utf-8');
	t.true(contents.every(item => text.includes(item)));
});

test('render json directory listing', async t => {
	const contents = await getDirectoryContents();
	const url = await getUrl();

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	t.is(type, 'application/json');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	t.true(existing);
});

test('render html sub directory listing', async t => {
	const name = 'special-directory';

	const sub = path.join(fixturesFull, name);
	const contents = await getDirectoryContents(sub, true);
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	const type = response.headers.get('content-type');
	t.is(type, 'text/html; charset=utf-8');

	t.true(contents.every(item => text.includes(item)));
});

test('render json sub directory listing', async t => {
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
	t.is(type, 'application/json');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	t.true(existing);
});

test('render dotfile', async t => {
	const name = '.dotfile';
	const related = path.join(fixturesFull, name);

	const content = await fs.readFile(related, 'utf8');
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	t.deepEqual(content, text);
});

test('render json file', async t => {
	const name = 'object.json';
	const related = path.join(fixturesFull, name);

	const content = await fs.readJSON(related);
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);

	const type = response.headers.get('content-type');
	t.is(type, 'application/json');

	const text = await response.text();
	const spec = JSON.parse(text);

	t.deepEqual(spec, content);
});

test('set `trailingSlash` config property to `true`', async t => {
	const url = await getUrl({
		trailingSlash: true
	});

	const target = `${url}/test`;

	const response = await fetch(target, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	t.is(location, `${target}/`);
});

test('set `trailingSlash` config property to any boolean and remove multiple slashes', async t => {
	const url = await getUrl({
		trailingSlash: true
	});

	const target = `${url}/test/`;

	const response = await fetch(`${target}//////`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	t.is(location, target);
});

test('set `trailingSlash` config property to `false`', async t => {
	const url = await getUrl({
		trailingSlash: false
	});

	const target = `${url}/test`;

	const response = await fetch(`${target}/`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	t.is(location, target);
});

test('set `rewrites` config property to wildcard path', async t => {
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

	t.is(text, content);
});

test('set `rewrites` config property to non-matching path', async t => {
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

	t.is(text, content);
});

test('set `rewrites` config property to one-star wildcard path', async t => {
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

	t.is(text, content);
});

test('set `rewrites` config property to path segment', async t => {
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

	t.deepEqual(json, content);
});

test('set `redirects` config property to wildcard path', async t => {
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
	t.is(location, `${url}/${destination}`);
});

test('set `redirects` config property to wildcard path and do not match', async t => {
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
	t.falsy(location);
});

test('set `redirects` config property to one-star wildcard path', async t => {
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
	t.is(location, `${url}/${destination}`);
});

test('set `redirects` config property to path segment', async t => {
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
	t.is(location, `${url}/mask/me`);
});

test('set `redirects` config property to wildcard path and `trailingSlash` to `true`', async t => {
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
	t.is(location, `${url + target}/`);
});

test('set `redirects` config property to wildcard path and `trailingSlash` to `false`', async t => {
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
	t.is(location, url + target);
});

test('pass custom handlers', async t => {
	const name = '.dotfile';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		stat: fs.stat,
		createReadStream: fs.createReadStream
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();
	const content = await fs.readFile(path.join(fixturesFull, name), 'utf8');

	t.is(text, content);
});

test('set `headers` to wildcard headers', async t => {
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

	t.is(cacheControl, value);
});

test('set `headers` to fixed headers and check default headers', async t => {
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

	t.is(cacheControl, value);
	t.is(type, 'application/json');
});

test('receive not found error', async t => {
	const url = await getUrl({
		'public': path.join(fixturesFull, 'directory')
	});

	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	t.is(text, 'Not Found');
});

test('receive not found error as json', async t => {
	const url = await getUrl();

	const response = await fetch(`${url}/not-existing`, {
		headers: {
			Accept: 'application/json'
		}
	});

	const json = await response.json();

	t.deepEqual(json, {
		error: {
			code: 'not_found',
			message: 'Not Found'
		}
	});
});

test('receive custom `404.html` error page', async t => {
	const url = await getUrl();
	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	t.is(text.trim(), '<span>Not Found</span>');
});

test('receive error because reading `404.html` failed', async t => {
	const message = 'This is an error';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		stat: location => {
			if (path.basename(location) === '404.html') {
				throw new Error(message);
			}

			return fs.stat(location);
		}
	});

	const response = await fetch(`${url}/not-existing`);
	const text = await response.text();

	t.is(response.status, 500);
	t.is(text, message);
});

test('disabled directory listing', async t => {
	const url = await getUrl({
		directoryListing: false
	});

	const response = await fetch(url);
	const text = await response.text();

	t.is(response.status, 404);
	t.is(text.trim(), '<span>Not Found</span>');
});

test('listing the directory failed', async t => {
	const message = 'This is an error';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		readdir: () => {
			throw new Error(message);
		}
	});

	const response = await fetch(url);
	const text = await response.text();

	t.is(response.status, 500);
	t.is(text, message);
});

test('set `cleanUrls` config property to `true`', async t => {
	const target = 'directory';
	const index = path.join(fixturesFull, target, 'index.html');

	const url = await getUrl({
		cleanUrls: true
	});

	const response = await fetch(`${url}/${target}`);
	const content = await fs.readFile(index, 'utf8');
	const text = await response.text();

	t.is(content, text);
});

test('set `cleanUrls` config property to array', async t => {
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

	t.is(content, text);
});

test('set `cleanUrls` config property to empty array', async t => {
	const name = 'directory';

	const sub = path.join(fixturesFull, name);
	const contents = await getDirectoryContents(sub, true);

	const url = await getUrl({
		cleanUrls: []
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	const type = response.headers.get('content-type');
	t.is(type, 'text/html; charset=utf-8');

	t.true(contents.every(item => text.includes(item)));
});

test('set `cleanUrls` config property to `true` and try with file', async t => {
	const target = '/directory/clean-file';

	const url = await getUrl({
		cleanUrls: true
	});

	const response = await fetch(`${url}${target}.html`, {
		redirect: 'manual',
		follow: 0
	});

	const location = response.headers.get('location');
	t.is(location, `${url}${target}`);
});

test('set `cleanUrls` config property to `true` and render `.htm` file', async t => {
	const target = 'another-directory';
	const index = path.join(fixturesFull, target, 'index.htm');

	const url = await getUrl({
		cleanUrls: true
	});

	const response = await fetch(`${url}/${target}`);
	const content = await fs.readFile(index, 'utf8');
	const text = await response.text();

	t.is(content, text);
});

test('set `cleanUrls` config property to `true` and not index file found', async t => {
	const contents = await getDirectoryContents();
	const url = await getUrl({cleanUrls: true});

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json'
		}
	});

	const type = response.headers.get('content-type');
	t.is(type, 'application/json');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	t.true(existing);
});

test('set `cleanUrls` config property to `true` and an error occurs', async t => {
	const target = 'directory';
	const message = 'This is an error';

	const url = await getUrl({
		cleanUrls: true
	}, {
		stat: location => {
			if (path.basename(location) === 'index.html') {
				throw new Error(message);
			}

			return fs.stat(location);
		}
	});

	const response = await fetch(`${url}/${target}`);
	const text = await response.text();

	t.is(response.status, 500);
	t.is(text, message);
});

test('error occurs while getting stat of path', async t => {
	const message = 'This is an error';

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		stat: () => {
			throw new Error(message);
		}
	});

	const response = await fetch(url);
	const text = await response.text();

	t.is(response.status, 500);
	t.is(text, message);
});

test('set `unlisted` config property to array', async t => {
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
	t.is(type, 'application/json');

	const {files} = await response.json();

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	t.true(existing);
});

test('set `createReadStream` handler to async function', async t => {
	const name = '.dotfile';
	const related = path.join(fixturesFull, name);
	const content = await fs.readFile(related, 'utf8');

	// eslint-disable-next-line no-undefined
	const url = await getUrl(undefined, {
		createReadStream: async file => {
			await sleep(2000);
			return fs.createReadStream(file);
		}
	});

	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	t.deepEqual(content, text);
});

test('return mime type of the `rewrittenPath` if mime type of `relativePath` is null', async t => {
	const url = await getUrl({
		rewrites: [{
			source: '**',
			destination: 'clean-file.html'
		}]
	});

	const response = await fetch(`${url}/whatever`);
	const type = response.headers.get('content-type');

	t.is(type, 'text/html');
});
