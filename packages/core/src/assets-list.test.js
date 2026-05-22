import assert from 'node:assert/strict';
import test from 'node:test';
import { listTentmanAssets, loadTentmanProject } from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

test('lists config asset counts across the fixture project', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-assets-list-'));
	const assets = await listTentmanAssets(project);

	assert.deepEqual(
		assets.map((entry) => [entry.label, entry.kind, entry.assetCount]),
		[
			['About', 'singleton', 5],
			['Blog Posts', 'collection', 3],
			['Contact', 'singleton', 0],
			['FAQ', 'singleton', 0],
			['News', 'singleton', 0],
			['Projects', 'singleton', 0]
		]
	);
	assert.equal(assets[1]?.reference, 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07');
	assert.equal(assets[1]?.contentPath, 'src/content/posts');
});

test('lists known assets for a selected config by item and field', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-assets-list-'));
	const assets = await listTentmanAssets(project, 'blog');

	assert.equal(assets.config.label, 'Blog Posts');
	assert.equal(assets.config.assetCount, 3);
	assert.equal(assets.items.length, 4);
	assert.equal(assets.items[0]?.assets.length, 1);
	assert.equal(assets.items[0]?.assets[0]?.fieldPath, 'coverImage');
	assert.equal(assets.items[0]?.assets[0]?.value, '/images/posts/field-notes.svg');
	assert.equal(assets.items[0]?.assets[0]?.expectedPrefix, '/images/posts');
	assert.equal(assets.items[0]?.assets[0]?.exists, true);
	assert.equal(assets.items[0]?.path, 'src/content/posts/blooop.md');
	assert.ok(assets.items.some((item) => item.assets.length === 0));
});

test('throws when listing assets for an unknown config reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-assets-list-'));

	await assert.rejects(
		() => listTentmanAssets(project, 'missing-config'),
		/Unknown content config reference/
	);
});
