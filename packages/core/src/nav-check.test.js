import assert from 'node:assert/strict';
import test from 'node:test';
import { checkNavigationManifest, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('reports the refreshed fixture manifest as clean', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const diagnostics = checkNavigationManifest(project);

	assert.equal(diagnostics.filter((diagnostic) => diagnostic.level === 'error').length, 0);
	assert.equal(
		diagnostics.filter((diagnostic) => diagnostic.code === 'manifest.legacy-reference').length,
		0
	);
});
