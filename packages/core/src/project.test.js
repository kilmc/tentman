import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTentmanIds, doctorTentmanProject, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('loads the monorepo fixture app as a Tentman project', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.equal(project.rootConfig.siteName, 'Test App');
	assert.equal(project.configs.length, 5);
	assert.equal(project.navigationManifest.exists, true);
	assert.equal(project.navigationManifest.error, null);
});

test('doctors the fixture without manifest or path errors', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const diagnostics = await doctorTentmanProject(project);

	assert.deepEqual(diagnostics, []);
});

test('reports the migrated fixture ids as clean', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const diagnostics = checkTentmanIds(project);

	assert.equal(diagnostics.filter((diagnostic) => diagnostic.code === 'id.missing').length, 0);
});
