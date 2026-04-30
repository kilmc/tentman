import assert from 'node:assert/strict';
import test from 'node:test';
import { getTentmanSchema, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('summarizes repo schema across content configs', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const schema = getTentmanSchema(project);

	assert.deepEqual(
		schema.map((entry) => [entry.label, entry.kind, entry.blockCount, entry.groupCount]),
		[
			['About Page', 'singleton', 5, 0],
			['Blog Posts', 'collection', 8, 0],
			['Contact Page', 'singleton', 9, 0],
			['News', 'singleton', 3, 0],
			['Projects', 'singleton', 3, 0]
		]
	);
	assert.equal(schema[1]?.reference, 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07');
	assert.equal(schema[1]?.contentPath, 'src/content/posts');
});

test('expands effective fields for a selected config schema', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const schema = getTentmanSchema(project, 'about');

	assert.equal(schema.config.label, 'About Page');
	assert.equal(schema.config.collection.enabled, false);
	assert.equal(schema.fields.length, 5);
	assert.deepEqual(schema.fields[0], {
		id: 'title',
		type: 'text',
		label: 'Title',
		required: true,
		show: 'primary',
		schemaKind: 'field'
	});
	assert.equal(schema.fields[3]?.schemaKind, 'inline-block');
	assert.equal(schema.fields[3]?.collection, true);
	assert.equal(schema.fields[3]?.fields.length, 3);
	assert.equal(schema.fields[4]?.schemaKind, 'reusable-block');
	assert.deepEqual(schema.fields[4]?.reusableBlock, {
		id: 'imageGallery',
		label: 'Image Gallery',
		path: 'tentman/blocks/image-gallery.tentman.json',
		collection: true,
		itemLabel: 'Image'
	});
	assert.equal(schema.fields[4]?.fields[0]?.type, 'image');
	assert.equal(schema.fields[4]?.fields[0]?.assetsDir, '../../static/images/gallery');
});

test('includes collection metadata in selected config schema', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const schema = getTentmanSchema(project, 'blog');

	assert.equal(schema.config.collection.enabled, true);
	assert.equal(schema.config.collection.itemLabel, 'Blog Post');
	assert.equal(schema.config.collection.idField, 'slug');
	assert.deepEqual(schema.config.collection.groups, []);
	assert.equal(schema.fields[4]?.type, 'image');
	assert.equal(schema.fields[4]?.assetsDir, '../../static/images/posts');
	assert.deepEqual(schema.fields[6]?.plugins, ['callout-chip']);
});

test('throws when exporting schema for an unknown config reference', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.throws(() => getTentmanSchema(project, 'missing-config'), /Unknown content config reference/);
});
