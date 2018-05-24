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

const getUrl = config => {
	const server = micro(async (request, response) => {
		await handler(request, response, config);
	});

	return listen(server);
};

const getDirectoryContents = async (location = process.cwd(), sub) => {
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
	const name = '.circleci';

	const sub = path.join(process.cwd(), name);
	const contents = await getDirectoryContents(sub, true);
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	const type = response.headers.get('content-type');
	t.is(type, 'text/html; charset=utf-8');

	t.true(contents.every(item => text.includes(item)));
});

test('render json sub directory listing', async t => {
	const name = 'src';

	const sub = path.join(process.cwd(), name);
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
	const name = '.yarnrc';
	const related = path.join(process.cwd(), name);

	const content = await fs.readFile(related, 'utf8');
	const url = await getUrl();
	const response = await fetch(`${url}/${name}`);
	const text = await response.text();

	t.deepEqual(content, text);
});

test('render json file', async t => {
	const name = 'package.json';
	const related = path.join(process.cwd(), name);

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

test('set `rewrites` config property to wildcard paths', async t => {
	const destination = '.yarnrc';
	const related = path.join(process.cwd(), destination);
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
