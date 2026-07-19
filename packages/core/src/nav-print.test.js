import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { loadTentmanProject, printTentmanNavigation } from './index.js';
import {
	copyCoreFixtureProjectToTempGitRepo,
	loadCoreFixtureProject
} from './test-paths.test-helper.js';

test('prints top-level navigation in effective manifest order', async () => {
	const project = await loadCoreFixtureProject();
	const navigation = printTentmanNavigation(project);

	assert.deepEqual(
		navigation.content.map((entry) => entry.label),
		['About', 'Blog Posts', 'Contact', 'FAQ', 'News', 'Projects']
	);
	assert.deepEqual(
		navigation.collections,
		[
			{
				label: 'Blog Posts',
				reference: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07',
				path: 'tentman/configs/blog.tentman.json',
				itemCount: 4
			}
		]
	);
});

test('prints effective collection navigation including manifest groups', async () => {
	const project = await loadCoreFixtureProject();
	const navigation = printTentmanNavigation(project, 'blog');

	assert.equal(navigation.config.label, 'Blog Posts');
	assert.deepEqual(
		navigation.items.map((item) => item.label),
		[
			'Rendering with content components',
			'Designing a reliable fixture',
			'FAQ as a nested content model',
			'Why this test app is so plain'
		]
	);
	assert.deepEqual(navigation.groups, []);
});

test('prints collection navigation resolved by canonical collection metadata', async (t) => {
	const projectRoot = await copyCoreFixtureProjectToTempGitRepo(t, 'tentman-core-nav-print-');
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
				{ "id": "tent_01KTVA0B0VT000000000000007" },
				{ "id": "tent_01KTVA0B0VT000000000000004" }
			]
		}
	}
}
`
	);
	const project = await loadTentmanProject(projectRoot);
	const navigation = printTentmanNavigation(project, 'blog');

	assert.deepEqual(
		navigation.items.map((item) => item.label),
		[
			'Why this test app is so plain',
			'Rendering with content components',
			'Designing a reliable fixture',
			'FAQ as a nested content model'
		]
	);
});

test('throws when printing collection navigation for a singleton config', async () => {
	const project = await loadCoreFixtureProject();

	assert.throws(
		() => printTentmanNavigation(project, 'about'),
		/About is not a collection config/
	);
});
