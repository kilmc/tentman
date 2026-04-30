import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTentmanProject, printTentmanNavigation } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('prints top-level navigation in effective manifest order', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const navigation = printTentmanNavigation(project);

	assert.deepEqual(
		navigation.content.map((entry) => entry.label),
		['Contact Page', 'About Page', 'Blog Posts', 'News', 'Projects']
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
	const project = await loadTentmanProject(testAppRoot);
	const navigation = printTentmanNavigation(project, 'blog');

	assert.equal(navigation.config.label, 'Blog Posts');
	assert.deepEqual(
		navigation.items.map((item) => item.label),
		[
			'Testing the new content workflows',
			'Designing a realistic fixture app',
			'Another Page',
			'Stuff 2'
		]
	);
	assert.deepEqual(
		navigation.groups.map((group) => ({
			id: group.id,
			label: group.label,
			items: group.items.map((item) => item.label)
		})),
		[
			{
				id: 'featured',
				label: 'Featured posts',
				items: ['Testing the new content workflows', 'Designing a realistic fixture app']
			}
		]
	);
});

test('throws when printing collection navigation for a singleton config', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.throws(
		() => printTentmanNavigation(project, 'about'),
		/About Page is not a collection config/
	);
});
