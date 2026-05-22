import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTentmanContent, loadTentmanProject } from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

test('inspects a singleton config without requiring an item reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-inspect-'));
	const result = inspectTentmanContent(project, 'about');

	assert.match(result.config.label, /About/);
	assert.equal(result.item.path, null);
	assert.equal(result.item.label, result.item.value.title);
	assert.equal(typeof result.item.value.body, 'string');
	assert.ok(result.item.value.body.length > 0);
});

test('inspects a collection item by any supported item reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-inspect-'));
	const result = inspectTentmanContent(project, 'blog', 'why-this-test-app-is-so-plain');

	assert.equal(result.config.label, 'Blog Posts');
	assert.equal(result.item.path, 'src/content/posts/testing-content-workflows.md');
	assert.equal(typeof result.item.value.slug, 'string');
	assert.ok(result.item.value.slug.length > 0);
	assert.match(result.item.reference ?? '', /^tent_/);
	assert.match(result.item.value.body ?? '', /Tentman|content/i);
});

test('requires an item reference for multi-item configs', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-inspect-'));

	assert.throws(
		() => inspectTentmanContent(project, 'blog'),
		/Blog Posts has 4 items; pass an item reference/
	);
});

test('throws when inspecting an unknown item reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-content-inspect-'));

	assert.throws(
		() => inspectTentmanContent(project, 'blog', 'missing-item'),
		/Unknown item reference for Blog Posts: missing-item/
	);
});
