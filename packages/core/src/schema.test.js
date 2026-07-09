import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { getTentmanSchema, loadTentmanProject } from './index.js';
import { copyTestAppToTempGitRepo } from './test-paths.test-helper.js';

test('summarizes repo schema across content configs', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-schema-'));
	const schema = getTentmanSchema(project);

	assert.deepEqual(
		schema.map((entry) => [entry.label, entry.kind, entry.blockCount, entry.groupCount]),
		[
			['About', 'singleton', 5, 0],
			['Blog Posts', 'collection', 8, 0],
			['Contact', 'singleton', 7, 0],
			['FAQ', 'singleton', 4, 0],
			['News', 'singleton', 3, 0],
			['Projects', 'singleton', 3, 0]
		]
	);
	assert.equal(schema[1]?.reference, 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07');
	assert.equal(schema[1]?.contentPath, 'src/content/posts');
});

test('expands effective fields for a selected config schema', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-schema-'));
	const schema = getTentmanSchema(project, 'about');

	assert.equal(schema.config.label, 'About');
	assert.equal(schema.config.collection.enabled, false);
	assert.equal(schema.fields.length, 5);
	assert.deepEqual(schema.fields[0], {
		id: 'title',
		type: 'text',
		label: 'Title',
		required: true,
		schemaKind: 'field'
	});
	assert.equal(schema.fields[3]?.schemaKind, 'inline-block');
	assert.equal(schema.fields[3]?.collection, true);
	assert.equal(schema.fields[3]?.fields.length, 3);
	assert.equal(schema.fields[4]?.schemaKind, 'inline-block');
	assert.equal(schema.fields[4]?.collection, undefined);
	assert.equal(schema.fields[4]?.fields.length, 3);
	assert.equal(schema.fields[4]?.fields[2]?.schemaKind, 'reusable-block');
	assert.deepEqual(schema.fields[4]?.fields[2]?.reusableBlock, {
		id: 'imageGallery',
		label: 'Image Gallery',
		path: 'tentman/blocks/image-gallery.tentman.json',
		collection: true,
		itemLabel: 'Image'
	});
	assert.equal(schema.fields[4]?.fields[2]?.fields[0]?.type, 'image');
	assert.equal(schema.fields[4]?.fields[2]?.fields[0]?.assetsDir, undefined);
});

test('includes collection metadata in selected config schema', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-schema-'));
	const schema = getTentmanSchema(project, 'blog');

	assert.equal(schema.config.collection.enabled, true);
	assert.equal(schema.config.collection.itemLabel, 'Blog Post');
	assert.equal(schema.config.collection.idField, 'slug');
	assert.equal(schema.config.collection.ordering, false);
	assert.equal(schema.config.collection.groupManagement, false);
	assert.deepEqual(schema.config.collection.groups, []);
	assert.equal(schema.fields[4]?.type, 'image');
	assert.equal(schema.fields[4]?.assetsDir, undefined);
	assert.deepEqual(schema.fields[6]?.components, undefined);
});

test('preserves item label source metadata in schema summaries', async () => {
	const rootDir = await copyTestAppToTempGitRepo('tentman-core-schema-');
	const configPath = path.join(rootDir, 'tentman/configs/blog.tentman.json');
	const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
	config.blocks[0].isItemLabel = true;
	config.blocks[1].itemLabelFormat = { month: 'short', day: 'numeric', year: 'numeric' };
	await fs.writeFile(configPath, JSON.stringify(config, null, 2));

	const project = await loadTentmanProject(rootDir);
	const schema = getTentmanSchema(project, 'blog');

	assert.equal(schema.fields[0]?.isItemLabel, true);
	assert.deepEqual(schema.fields[1]?.itemLabelFormat, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
});

test('throws when exporting schema for an unknown config reference', async () => {
	const project = await loadTentmanProject(await copyTestAppToTempGitRepo('tentman-core-schema-'));

	assert.throws(() => getTentmanSchema(project, 'missing-config'), /Unknown content config reference/);
});
