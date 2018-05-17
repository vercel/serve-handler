# serve-handler

[![Build Status](https://circleci.com/gh/zeit/serve-handler.svg?&style=shield&circle-token=75e1ee77692419df0d17174ce5c7b5fe2d2a78a6)](https://circleci.com/gh/zeit/serve-handler)
[![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/micro/serve)

This package represents the core of [serve](https://github.com/zeit/serve) and static deployments running on [Now](https://zeit.co/now). It can be plugged into any HTTP server and is responsible for routing requests and handling responses.

In order to customize the default behaviour, you can also pass custom routing rules, provide your own methods for interacting with the file system and much more.

## Usage

Get started by installing the package using [yarn](https://yarnpkg.com/lang/en/):

```js
yarn add serve-handler
```

You can also use [npm](https://www.npmjs.com/) instead, if you'd like:

```js
npm install serve-handler
```

Next, add it to your HTTP server. Here's an example with [micro](https://github.com/zeit/micro):

```js
const handler = require('serve-handler');

module.exports = async (request, response) => {
	await handler(request, response);
};
```

That's it! :tada:

### Configuration

In order to allow for customizing the package's default behaviour, we implemented two more arguments for the function call. They are both to be seen as configuration arguments.

#### Options

The first one is for statically defined options:

```js
await handler(request, response, {
	path: 'dist'
});
```

You can use any of the following options:

| Name   | Description                                                        | Default Value   |
|--------|--------------------------------------------------------------------|-----------------|
| `path` | A custom directory to which all requested paths should be relative | `process.cwd()` |

#### Middleware

While the second one is for passing custom methods to replace the ones used in the package:

```js
await handler(request, response, null, {
	createReadStream(path) {},
	stat(path) {}
});
```

## Real-World Use Cases

There are two environments in which [ZEIT](https://zeit.co) uses this package:

### Development

When running static applications or sites on your local device, we suggest using [serve](https://github.com/zeit/serve).

Since it comes with support for `serve-handler` out of the box, you can create a `serve.json` file to customize its behavior. It will also read the configuration from `static` inside `now.json`.

### Production

When deploying your site to [Now](https://zeit.co/now), both the `serve.json` file or the `static` property inside `now.json` will be parsed and used to handle requests on the platform.

## Author

Leo Lamprecht ([@notquiteleo](https://twitter.com/notquiteleo)) - [ZEIT](https://zeit.co)
