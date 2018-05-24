// Native
const path = require('path');

// Packages
const test = require('ava');
const listen = require('test-listen');
const micro = require('micro');
const fetch = require('node-fetch');
const fs = require('fs-extra');

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

const getDirectoryContents = async (location = fixturesFull, sub) => {
	const excluded = [
		'.DS_Store',
		'.git'
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
	const name = 'directory';

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
	const name = 'another-directory';

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

test('use `public` config property', async t => {
	const name = 'src';
	const url = await getUrl({'public': name});

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json'
		}
	});

	const {files, directory} = await response.json();
	t.is(directory, 'src/');

	const type = response.headers.get('content-type');
	t.is(type, 'application/json');

	const related = path.join(process.cwd(), name);
	const contents = await getDirectoryContents(related);

	const existing = files.every(file => {
		const full = file.base.replace('/', '');
		return contents.includes(full);
	});

	t.true(existing);
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
	const url = await getUrl();
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
