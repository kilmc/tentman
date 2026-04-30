import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTentmanContent, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('inspects a singleton config without requiring an item reference', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const result = inspectTentmanContent(project, 'about');

	assert.equal(result.config.label, 'About Page');
	assert.equal(result.item.label, 'A small test site for a much more flexible CMS');
	assert.equal(result.item.path, null);
	assert.equal(result.item.value.title, 'A small test site for a much more flexible CMS');
});

test('inspects a collection item by any supported item reference', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const result = inspectTentmanContent(project, 'blog', 'testing-content-workflows');

	assert.equal(result.config.label, 'Blog Posts');
	assert.equal(result.item.reference, 'tent_01KQD7Q12ZHBTXG669982DV00K');
	assert.equal(result.item.path, 'src/content/posts/testing-content-workflows.md');
	assert.equal(result.item.value.slug, 'testing-content-workflows');
});

test('requires an item reference for multi-item configs', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.throws(
		() => inspectTentmanContent(project, 'blog'),
		/Blog Posts has 4 items; pass an item reference/
	);
});

test('throws when inspecting an unknown item reference', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.throws(
		() => inspectTentmanContent(project, 'blog', 'missing-item'),
		/Unknown item reference for Blog Posts: missing-item/
	);
});
