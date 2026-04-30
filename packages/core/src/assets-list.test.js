import assert from 'node:assert/strict';
import test from 'node:test';
import { listTentmanAssets, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('lists config asset counts across the fixture project', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const assets = await listTentmanAssets(project);

	assert.deepEqual(
		assets.map((entry) => [entry.label, entry.kind, entry.assetCount]),
		[
			['About Page', 'singleton', 3],
			['Blog Posts', 'collection', 3],
			['Contact Page', 'singleton', 2],
			['News', 'singleton', 0],
			['Projects', 'singleton', 0]
		]
	);
	assert.equal(assets[1]?.reference, 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07');
	assert.equal(assets[1]?.contentPath, 'src/content/posts');
});

test('lists known assets for a selected config by item and field', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const assets = await listTentmanAssets(project, 'blog');

	assert.equal(assets.config.label, 'Blog Posts');
	assert.equal(assets.config.assetCount, 3);
	assert.equal(assets.items.length, 4);
	assert.equal(assets.items[0]?.assets.length, 1);
	assert.equal(assets.items[0]?.assets[0]?.fieldPath, 'coverImage');
	assert.equal(assets.items[0]?.assets[0]?.value, '/images/posts/untitled-project-moss-night-8x-a9cb1d53.png');
	assert.equal(assets.items[0]?.assets[0]?.expectedPrefix, '/images/posts');
	assert.equal(assets.items[0]?.assets[0]?.exists, true);
	assert.equal(assets.items[0]?.path, 'src/content/posts/blooop.md');
	assert.ok(assets.items.some((item) => item.assets.length === 0));
});

test('throws when listing assets for an unknown config reference', async () => {
	const project = await loadTentmanProject(testAppRoot);

	await assert.rejects(
		() => listTentmanAssets(project, 'missing-config'),
		/Unknown content config reference/
	);
});
