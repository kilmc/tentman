import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	loadTentmanProject,
	resolveTentmanMarkdownFileRenderContext
} from './index.js';

async function createMarkdownRenderContextFixture() {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-markdown-context-'));

	await Promise.all([
		fs.mkdir(path.join(projectRoot, 'tentman/configs'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'tentman/blocks'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'src/routes/about'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'src/content/posts'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'notes'), { recursive: true })
	]);

	await Promise.all([
		fs.writeFile(
			path.join(projectRoot, '.tentman.json'),
			JSON.stringify(
				{
					configsDir: './tentman/configs',
					blocksDir: './tentman/blocks'
				},
				null,
				'\t'
			)
		),
		fs.writeFile(
			path.join(projectRoot, 'tentman/blocks/highlight-group.tentman.json'),
			JSON.stringify(
				{
					type: 'block',
					id: 'highlight-group',
					label: 'Highlight Group',
					blocks: [
						{ id: 'eyebrow', type: 'text', label: 'Eyebrow' },
						{ id: 'detail', type: 'textarea', label: 'Detail' }
					]
				},
				null,
				'\t'
			)
		),
		fs.writeFile(
			path.join(projectRoot, 'tentman/configs/about.tentman.json'),
			JSON.stringify(
				{
					type: 'content',
					label: 'About',
					id: 'about',
					content: {
						mode: 'file',
						path: '../../src/routes/about/+page.md'
					},
					blocks: [
						{ id: 'title', type: 'text', label: 'Title', required: true },
						{ id: 'intro', type: 'textarea', label: 'Intro', required: true },
						{ id: 'body', type: 'markdown', label: 'Body', required: true },
						{
							id: 'gallery',
							type: 'block',
							label: 'Gallery',
							referenceFor: ['gallery-embed'],
							blocks: [
								{ id: 'title', type: 'text', label: 'Title' },
								{ id: 'summary', type: 'textarea', label: 'Summary' }
							]
						},
						{
							id: 'details',
							type: 'highlight-group',
							label: 'Details'
						}
					]
				},
				null,
				'\t'
			)
		),
		fs.writeFile(
			path.join(projectRoot, 'tentman/configs/blog.tentman.json'),
			JSON.stringify(
				{
					type: 'content',
					label: 'Blog',
					id: 'blog',
					collection: true,
					content: {
						mode: 'directory',
						path: '../../src/content/posts'
					},
					blocks: [
						{ id: 'title', type: 'text', label: 'Title', required: true },
						{ id: 'slug', type: 'text', label: 'Slug', required: true },
						{ id: 'body', type: 'markdown', label: 'Body', required: true },
						{
							id: 'gallery',
							type: 'block',
							label: 'Gallery',
							blocks: [
								{
									id: 'referenceToken',
									type: 'text',
									label: 'Reference token',
									referenceFor: ['project-gallery:galleryRef']
								},
								{ id: 'title', type: 'text', label: 'Title' },
								{ id: 'summary', type: 'textarea', label: 'Summary' }
							]
						}
					]
				},
				null,
				'\t'
			)
		),
		fs.writeFile(
			path.join(projectRoot, 'src/routes/about/+page.md'),
			`---
title: About this fixture
intro: Route-backed markdown singleton
gallery:
  title: About gallery
  summary: Marker-only component data
details:
  eyebrow: Shared block
  detail: Reusable block content expands through the shared resolver.
---
## Welcome

::gallery-embed
`
		),
		fs.writeFile(
			path.join(projectRoot, 'src/content/posts/field-notes.md'),
			`---
title: Field Notes
slug: field-notes
gallery:
  referenceToken: featured-gallery
  title: Featured work
  summary: Selector-based references for markdown collections.
---
## Entry

::project-gallery{galleryRef="featured-gallery"}
`
		),
		fs.writeFile(path.join(projectRoot, 'notes/unmanaged.md'), '# Outside Tentman\n')
	]);

	return {
		projectRoot,
		aboutFilePath: path.join(projectRoot, 'src/routes/about/+page.md'),
		postFilePath: path.join(projectRoot, 'src/content/posts/field-notes.md'),
		unmanagedFilePath: path.join(projectRoot, 'notes/unmanaged.md')
	};
}

test('resolves a file-backed markdown singleton to Tentman render context', async () => {
	const fixture = await createMarkdownRenderContextFixture();
	const project = await loadTentmanProject(fixture.projectRoot);
	const context = resolveTentmanMarkdownFileRenderContext(project, fixture.aboutFilePath);

	assert.ok(context);
	assert.equal(context.config.id, 'about');
	assert.equal(context.contentItem.title, 'About this fixture');
	assert.equal(context.blocks[2].id, 'body');
});

test('resolves a directory-backed markdown item to Tentman render context', async () => {
	const fixture = await createMarkdownRenderContextFixture();
	const project = await loadTentmanProject(fixture.projectRoot);
	const context = resolveTentmanMarkdownFileRenderContext(project, fixture.postFilePath);

	assert.ok(context);
	assert.equal(context.config.id, 'blog');
	assert.equal(context.contentItem.slug, 'field-notes');
	assert.equal(context.contentItem.filename, 'field-notes.md');
});

test('expands reusable blocks through the shared structured block resolver', async () => {
	const fixture = await createMarkdownRenderContextFixture();
	const project = await loadTentmanProject(fixture.projectRoot);
	const context = resolveTentmanMarkdownFileRenderContext(project, fixture.aboutFilePath);
	const nestedBlocks = context.resolveStructuredBlocks({ type: 'highlight-group' });

	assert.deepEqual(
		nestedBlocks?.map((block) => block.id),
		['eyebrow', 'detail']
	);
});

test('builds marker-only and selector-based reference indexes for Tentman markdown files', async () => {
	const fixture = await createMarkdownRenderContextFixture();
	const project = await loadTentmanProject(fixture.projectRoot);
	const aboutContext = resolveTentmanMarkdownFileRenderContext(project, fixture.aboutFilePath);
	const postContext = resolveTentmanMarkdownFileRenderContext(project, fixture.postFilePath);

	assert.deepEqual(aboutContext.referenceIndex.get('gallery-embed')?.get('gallery')?.self, {
		title: 'About gallery',
		summary: 'Marker-only component data'
	});
	assert.deepEqual(
		postContext.referenceIndex.get('project-gallery:galleryRef')?.get('featured-gallery')?.full.gallery,
		{
			referenceToken: 'featured-gallery',
			title: 'Featured work',
			summary: 'Selector-based references for markdown collections.'
		}
	);
});

test('returns null for markdown files outside Tentman-managed content', async () => {
	const fixture = await createMarkdownRenderContextFixture();
	const project = await loadTentmanProject(fixture.projectRoot);

	assert.equal(resolveTentmanMarkdownFileRenderContext(project, fixture.unmanagedFilePath), null);
});

test('throws a clear error when a Tentman-managed markdown file cannot be resolved to content', async () => {
	const fixture = await createMarkdownRenderContextFixture();
	const project = await loadTentmanProject(fixture.projectRoot);
	const aboutConfig = project.configs.find((config) => config.id === 'about');

	project.contentByConfigPath.set(aboutConfig.path, {
		exists: true,
		path: 'src/routes/about/+page.md',
		items: []
	});

	assert.throws(
		() => resolveTentmanMarkdownFileRenderContext(project, fixture.aboutFilePath),
		/Tentman-managed markdown file could not be resolved to a content item: src\/routes\/about\/\+page\.md/
	);
});
