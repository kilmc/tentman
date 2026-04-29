import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	checkNavigationManifest,
	loadTentmanProject,
	parseNavigationManifest,
	refreshNavigationManifest,
	summarizeNavigationRefreshChanges
} from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

async function copyFixture() {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-core-nav-'));
	const projectRoot = path.join(tempRoot, 'test-app');
	await fs.cp(testAppRoot, projectRoot, { recursive: true });
	await writeLegacyNavigationManifest(projectRoot);
	return projectRoot;
}

async function writeLegacyNavigationManifest(projectRoot) {
	await fs.writeFile(
		path.join(projectRoot, 'tentman/navigation-manifest.json'),
		`{
	"version": 1,
	"content": {
		"items": [
			"contact",
			"about",
			"blog",
			"news",
			"projects"
		]
	},
	"collections": {
		"blog": {
			"items": [
				"testing-content-workflows",
				"designing-a-realistic-fixture",
				"blooop",
				"stuff-2"
			],
			"groups": [
				{
					"id": "featured",
					"label": "Featured posts",
					"items": [
						"testing-content-workflows",
						"designing-a-realistic-fixture"
					]
				}
			]
		}
	}
}
`
	);
}

test('refreshes navigation manifest references to stable ids', async () => {
	const projectRoot = await copyFixture();
	const project = await loadTentmanProject(projectRoot);
	const beforeDiagnostics = checkNavigationManifest(project);

	assert.equal(beforeDiagnostics.filter((diagnostic) => diagnostic.level === 'error').length, 0);
	assert.equal(
		beforeDiagnostics.filter((diagnostic) => diagnostic.code === 'manifest.legacy-reference').length,
		10
	);

	const result = await refreshNavigationManifest(project);
	const summary = summarizeNavigationRefreshChanges(result);

	assert.equal(result.changed, true);
	assert.deepEqual(summary, {
		configs: 5,
		collections: 1,
		groups: 0,
		items: 6
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
		'tent_01KQD7Q1301SNN4W42XV2XYA17',
		'tent_01KQD7Q12XGD83Y8S1TAHW40G3',
		'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07',
		'tent_01KQD7Q130YKZ4XV6JRZ8B9BH8',
		'tent_01KQD7Q130M4G8TR170P1H4FKX'
	]);

	const blogCollection = manifest.collections.tent_01KQD7Q12YAMHFJ3FWHBQ16Z07;
	assert.deepEqual(blogCollection.items, [
		'tent_01KQD7Q12ZHBTXG669982DV00K',
		'tent_01KQD7Q12ZH61M4XHDTEQ5MV98',
		'tent_01KQD7Q12Y6C3T8QD4JHQ1SWPD',
		'tent_01KQD7Q12Z8C6K7C008CDDVCR4'
	]);
	assert.deepEqual(blogCollection.groups, [
		{
			id: 'featured',
			label: 'Featured posts',
			items: [
				'tent_01KQD7Q12ZHBTXG669982DV00K',
				'tent_01KQD7Q12ZH61M4XHDTEQ5MV98'
			]
		}
	]);
});
