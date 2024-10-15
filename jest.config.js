module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
	collectCoverage: true,
	coverageReporters: ['text', 'lcov'],
	coverageDirectory: 'coverage',
	coveragePathIgnorePatterns: [
		'/node_modules/',
		'/test/',
		'/coverage/',
		'/src/directory.js',
		'/src/error.js'
	]
};
