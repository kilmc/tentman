import assert from 'node:assert/strict';
import test from 'node:test';
import { listTentmanContent, loadTentmanProject } from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

test('lists discovered content configs with summary metadata', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-list-'));
	const content = listTentmanContent(project);

	assert.equal(content.length, 6);
	assert.deepEqual(
		content.map((entry) => [entry.label, entry.kind, entry.itemCount]),
		[
			['About', 'singleton', 1],
			['Blog Posts', 'collection', 4],
			['Contact', 'singleton', 1],
			['FAQ', 'singleton', 1],
			['News', 'singleton', 1],
			['Projects', 'singleton', 1]
		]
	);
	assert.equal(content[1]?.reference, 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07');
	assert.equal(content[1]?.contentPath, 'src/content/posts');
});

test('lists collection items by any known config reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-list-'));
	const content = listTentmanContent(project, 'blog');

	assert.equal(content.config.label, 'Blog Posts');
	assert.deepEqual(content.config.references, [
		'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07',
		'blog'
	]);
	assert.equal(content.items.length, 4);
	assert.equal(content.items[0]?.path, 'src/content/posts/blooop.md');
	assert.ok(content.items.some((item) => item.reference === 'tent_01KTVA0B0VT000000000000007'));
});

test('throws when listing an unknown config reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-list-'));

	assert.throws(() => listTentmanContent(project, 'missing-config'), /Unknown content config reference/);
});
