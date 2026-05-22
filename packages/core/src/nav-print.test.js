import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTentmanProject, printTentmanNavigation } from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

test('prints top-level navigation in effective manifest order', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-nav-print-'));
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
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-nav-print-'));
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

test('throws when printing collection navigation for a singleton config', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-nav-print-'));

	assert.throws(
		() => printTentmanNavigation(project, 'about'),
		/About is not a collection config/
	);
});
