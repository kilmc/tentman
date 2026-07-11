import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	checkNavigationManifest,
	loadTentmanProject,
	parseNavigationManifest,
	refreshNavigationManifest,
	summarizeNavigationRefreshChanges
} from './index.js';
import { copyCoreFixtureProjectToTempGitRepo } from './test-paths.test-helper.js';

async function copyFixture(t) {
	return copyCoreFixtureProjectToTempGitRepo(t, 'tentman-core-nav-');
}

async function writeLegacyNavigationManifest(projectRoot) {
	await fs.writeFile(
		path.join(projectRoot, 'tentman/navigation-manifest.json'),
		`{
	"version": 1,
	"content": {
		"items": [
			"about",
			"blog",
			"contact",
			"faq",
			"news",
			"projects"
		]
	},
	"collections": {
		"blog": {
			"items": [
				"rendering-with-content-components",
				"designing-a-reliable-fixture",
				"faq-as-a-nested-content-model",
				"why-this-test-app-is-so-plain"
			]
		}
	}
}
`
	);
}

test('refreshes navigation manifest references to stable ids', async (t) => {
	const projectRoot = await copyFixture(t);
	await writeLegacyNavigationManifest(projectRoot);
	const project = await loadTentmanProject(projectRoot);
	const beforeDiagnostics = checkNavigationManifest(project);

	assert.equal(beforeDiagnostics.filter((diagnostic) => diagnostic.level === 'error').length, 0);
	assert.equal(
		beforeDiagnostics.filter((diagnostic) => diagnostic.code === 'manifest.legacy-reference').length,
		11
	);

	const result = await refreshNavigationManifest(project);
	const summary = summarizeNavigationRefreshChanges(result);

	assert.equal(result.changed, true);
	assert.deepEqual(summary, {
		configs: 6,
		collections: 1,
		groups: 0,
		items: 4
	});

	const nextProject = await loadTentmanProject(projectRoot);
	const afterDiagnostics = checkNavigationManifest(nextProject);

	assert.equal(afterDiagnostics.filter((diagnostic) => diagnostic.level === 'error').length, 0);
	assert.equal(
		afterDiagnostics.filter((diagnostic) => diagnostic.code === 'manifest.legacy-reference').length,
		0
	);

	const manifestSource = await fs.readFile(
		path.join(projectRoot, 'tentman/navigation-manifest.json'),
		'utf8'
	);
	const manifest = parseNavigationManifest(manifestSource);

	assert.deepEqual(manifest.content.items, [
		{ id: 'tent_01KTVA0B0VT000000000000001' },
		{ id: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07' },
		{ id: 'tent_01KTVA0B0VT000000000000002' },
		{ id: 'tent_01KTVA0B0VT000000000000003' },
		{ id: 'tent_01KQD7Q130YKZ4XV6JRZ8B9BH8' },
		{ id: 'tent_01KQD7Q130M4G8TR170P1H4FKX' }
	]);

	const blogCollection = manifest.collections.tent_01KQD7Q12YAMHFJ3FWHBQ16Z07;
	assert.deepEqual(blogCollection.items, [
		{ id: 'tent_01KTVA0B0VT000000000000004' },
		{ id: 'tent_01KTVA0B0VT000000000000005' },
		{ id: 'tent_01KTVA0B0VT000000000000006' },
		{ id: 'tent_01KTVA0B0VT000000000000007' }
	]);
	assert.equal(blogCollection.groups, undefined);
});
