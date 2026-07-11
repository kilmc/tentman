import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checkNavigationManifest, loadTentmanProject } from './index.js';
import {
	copyCoreFixtureProjectToTempGitRepo,
	loadCoreFixtureProject
} from './test-paths.test-helper.js';

test('reports the refreshed fixture manifest as clean', async () => {
	const project = await loadCoreFixtureProject();
	const diagnostics = checkNavigationManifest(project);

	assert.equal(diagnostics.filter((diagnostic) => diagnostic.level === 'error').length, 0);
	assert.equal(
		diagnostics.filter((diagnostic) => diagnostic.code === 'manifest.legacy-reference').length,
		0
	);
});

test('resolves collection diagnostics through canonical collection references', async (t) => {
	const projectRoot = await copyCoreFixtureProjectToTempGitRepo(t, 'tentman-core-nav-check-');
	await fs.writeFile(
		path.join(projectRoot, 'tentman/navigation-manifest.json'),
		`{
	"version": 1,
	"content": {
		"items": [
			{ "id": "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07" }
		]
	},
	"collections": {
		"legacy-blog-key": {
			"id": "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07",
			"configId": "blog",
			"items": [
				{ "id": "tent_01KTVA0B0VT000000000000004" }
			]
		}
	}
}
`
	);
	const project = await loadTentmanProject(projectRoot);
	const diagnostics = checkNavigationManifest(project);

	assert.equal(
		diagnostics.some((diagnostic) => diagnostic.code === 'manifest.stale-collection-reference'),
		false
	);
	assert.equal(
		diagnostics.filter((diagnostic) => diagnostic.code === 'manifest.legacy-reference').length,
		1
	);
});
