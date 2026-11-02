const {spawnSync} = require('child_process');

test('@minimatch-bounded brace expansion stays within the configured limit', () => {
	// Keep a vulnerable dependency from exhausting the test runner itself.
	const script = `
		const assert = require('assert');
		const {braceExpand} = require('minimatch');
		const expansions = braceExpand('{a,b}'.repeat(30), {braceExpandMax: 64});
		assert(expansions.length > 0 && expansions.length <= 64);
		assert(expansions.every(value => /^[ab]{30}$/.test(value)));
	`;
	const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', script], {
		encoding: 'utf8',
		timeout: 5000
	});

	expect(result.error).toBeUndefined();
	expect(result.stderr).not.toMatch(/heap out of memory/);
	expect(result.signal).toBeNull();
	expect(result.status).toBe(0);
});
