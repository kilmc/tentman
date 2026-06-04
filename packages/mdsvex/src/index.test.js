import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compile } from 'mdsvex';
import remarkDirective from 'remark-directive';
import { collectContentComponentReferenceIndex } from '@tentman/core';
import { tentmanComponents } from './index.js';

const coreFixturesRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../core/src/fixtures/content-components'
);

async function renderMarkdown(source, options = {}) {
	const rendered = await compile(source, {
		filename: options.filename ?? 'component-test.svx',
		extensions: ['.svx', '.md'],
		remarkPlugins: [
			remarkDirective,
			tentmanComponents({
				componentsDir: options.componentsDir,
				onError: options.onError,
				projectRoot: options.projectRoot,
				resolveTentmanContext: options.resolveTentmanContext,
				resolveRenderOptions: options.resolveRenderOptions
			})
		]
	});

	if (typeof rendered?.code !== 'string') {
		throw new Error('Failed to compile markdown');
	}

	return rendered.code;
}

async function createAutoContextFixture() {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-mdsvex-auto-'));
	const componentsDir = path.join(projectRoot, 'src/lib/content-components');
	const aboutFilePath = path.join(projectRoot, 'src/routes/about/+page.md');
	const postFilePath = path.join(projectRoot, 'src/content/posts/field-notes.md');
	const unmanagedFilePath = path.join(projectRoot, 'notes/unmanaged.md');

	await Promise.all([
		fs.mkdir(path.join(projectRoot, '.git'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'tentman/configs'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'src/routes/about'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'src/content/posts'), { recursive: true }),
		fs.mkdir(path.join(projectRoot, 'notes'), { recursive: true }),
		fs.mkdir(path.join(componentsDir, 'gallery-embed'), { recursive: true }),
		fs.mkdir(path.join(componentsDir, 'project-gallery'), { recursive: true })
	]);

	await Promise.all([
		fs.writeFile(
			path.join(projectRoot, 'tentman.json'),
			JSON.stringify(
				{
					configsDir: './tentman/configs',
					componentsDir: './src/lib/content-components'
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
			path.join(componentsDir, 'gallery-embed/component.json'),
			JSON.stringify(
				{
					id: 'gallery-embed',
					name: 'gallery-embed',
					kind: 'block',
					render: {
						mdsvex: {
							from: '$lib/components/GalleryEmbed.svelte',
							component: 'GalleryEmbed',
							props: {
								gallery: 'data'
							}
						}
					}
				},
				null,
				'\t'
			)
		),
		fs.writeFile(path.join(componentsDir, 'gallery-embed/render.njk'), '<div>{{ data.title }}</div>\n'),
		fs.writeFile(
			path.join(componentsDir, 'project-gallery/component.json'),
			JSON.stringify(
				{
					id: 'project-gallery',
					name: 'project-gallery',
					kind: 'block',
					attributes: {
						galleryRef: {
							type: 'string',
							required: true,
							reference: true,
							referenceScope: 'full'
						}
					},
					render: {
						mdsvex: {
							from: '$lib/components/ProjectGallery.svelte',
							component: 'ProjectGallery',
							props: {
								gallery: 'data.gallery'
							}
						}
					}
				},
				null,
				'\t'
			)
		),
		fs.writeFile(path.join(componentsDir, 'project-gallery/render.njk'), '<div>{{ data.gallery.title }}</div>\n'),
		fs.writeFile(
			aboutFilePath,
			`---
title: About this fixture
intro: Route-backed markdown singleton
gallery:
  title: About gallery
  summary: Marker-only component data
---
## Welcome

::gallery-embed
`
		),
		fs.writeFile(
			postFilePath,
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
		fs.writeFile(unmanagedFilePath, '# Plain markdown\n')
	]);

	return {
		projectRoot,
		aboutFilePath,
		postFilePath,
		unmanagedFilePath
	};
}

test('renders a valid inline directive through render.njk', async () => {
	const code = await renderMarkdown(':buy-button[Buy tickets]{href="/tickets" variant="secondary"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline')
	});

	assert.match(
		code,
		/<a class="buy-button buy-button--secondary" href="\/tickets" data-buy-button data-variant="secondary">Buy tickets<\/a>/
	);
});

test('renders a label-less inline directive through render.njk', async () => {
	const code = await renderMarkdown(':doc-link{href="/docs"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline')
	});

	assert.match(code, /<a class="doc-link" href="\/docs">Read more<\/a>/);
});

test('renders a valid block directive through render.njk', async () => {
	const code = await renderMarkdown('::callout-box{title="Latest update" tone="warning"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-block')
	});

	assert.match(code, /Latest update/);
});

test('throws for a missing required directive attribute in strict mode', async () => {
	await assert.rejects(
		renderMarkdown(':buy-button[Buy tickets]', {
			componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
			filename: 'missing-required.svx'
		}),
		/missing-required\.svx:1:1 for component buy-button: Content component attribute href is required/
	);
});

test('throws for an unknown component name in strict mode', async () => {
	await assert.rejects(
		renderMarkdown(':missing-widget[Hello]{href="/x"}', {
			componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
			filename: 'unknown-component.svx'
		}),
		/unknown-component\.svx:1:1 for component missing-widget: Unknown content component name: missing-widget/
	);
});

test('warning mode preserves the original directive source for unknown components', async () => {
	const code = await renderMarkdown(':missing-widget[Hello]{href="/x"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
		onError: 'warn',
		filename: 'warn-unknown.svx'
	});

	assert.match(code, /:missing-widget\[Hello\]\{href="\/x"\}/);
});

test('warning mode preserves the original directive source for invalid instances', async () => {
	const code = await renderMarkdown(':buy-button[Buy tickets]{variant="secondary"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
		onError: 'warn',
		filename: 'warn-invalid.svx'
	});

	assert.match(code, /:buy-button\[Buy tickets\]\{variant="secondary"\}/);
});

test('renders mdsvex target components with imports when configured', async () => {
	const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-mdsvex-'));
	const componentDir = path.join(fixtureRoot, 'gallery-embed');

	await fs.mkdir(componentDir, { recursive: true });
	await Promise.all([
		fs.writeFile(
			path.join(componentDir, 'component.json'),
			JSON.stringify(
				{
					id: 'gallery-embed',
					name: 'gallery-embed',
					kind: 'block',
					attributes: {
						title: {
							type: 'string',
							required: true
						}
					},
					render: {
						mdsvex: {
							from: '$lib/components/GalleryEmbed.svelte',
							component: 'GalleryEmbed',
							props: {
								title: 'attributes.title'
							}
						}
					}
				},
				null,
				'\t'
			)
		),
		fs.writeFile(path.join(componentDir, 'render.njk'), '<div>{{ title }}</div>\n')
	]);

	const code = await renderMarkdown('::gallery-embed{title="City sketches"}', {
		componentsDir: fixtureRoot
	});

	assert.match(code, /import GalleryEmbed from '\$lib\/components\/GalleryEmbed\.svelte';/);
	assert.match(code, /<GalleryEmbed title=\{"City sketches"\} \/>/);
});

test('resolves mdsvex target props from shared reference data when render context is provided', async () => {
	const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-mdsvex-reference-'));
	const componentDir = path.join(fixtureRoot, 'gallery-embed');

	await fs.mkdir(componentDir, { recursive: true });
	await Promise.all([
		fs.writeFile(
			path.join(componentDir, 'component.json'),
			JSON.stringify(
				{
					id: 'gallery-embed',
					name: 'gallery-embed',
					kind: 'block',
					attributes: {
						galleryRef: {
							type: 'string',
							default: 'main',
							reference: true,
							referenceScope: 'container'
						}
					},
					render: {
						mdsvex: {
							from: '$lib/components/GalleryEmbed.svelte',
							component: 'GalleryEmbed',
							props: {
								gallery: 'data.gallery'
							}
						}
					}
				},
				null,
				'\t'
			)
		),
		fs.writeFile(path.join(componentDir, 'render.njk'), '<div>{{ data.gallery.title }}</div>\n')
	]);

	const contentItem = {
		body: '::gallery-embed',
		gallery: {
			referenceToken: 'main',
			title: 'Homepage gallery'
		}
	};
	const { referenceIndex } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'body',
				type: 'markdown'
			},
			{
				id: 'gallery',
				type: 'block',
				blocks: [
					{
						id: 'referenceToken',
						type: 'text',
						referenceFor: ['gallery-embed:galleryRef']
					},
					{
						id: 'title',
						type: 'text'
					}
				]
			}
		],
		contentItem,
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	const rendered = await compile('::gallery-embed', {
		filename: 'reference-mdsvex.svx',
		remarkPlugins: [
			remarkDirective,
			tentmanComponents({
				componentsDir: fixtureRoot,
				resolveRenderOptions() {
					return {
						contentItem,
						referenceIndex
					};
				}
			})
		]
	});

	if (typeof rendered?.code !== 'string') {
		throw new Error('Failed to compile markdown');
	}

	assert.match(rendered.code, /import GalleryEmbed from '\$lib\/components\/GalleryEmbed\.svelte';/);
	assert.match(rendered.code, /<GalleryEmbed gallery=\{undefined\} \/>/);
});

test('auto mode resolves marker-only component data for a markdown singleton', async () => {
	const fixture = await createAutoContextFixture();
	const source = await fs.readFile(fixture.aboutFilePath, 'utf8');
	const code = await renderMarkdown(source, {
		filename: fixture.aboutFilePath,
		projectRoot: fixture.projectRoot,
		resolveTentmanContext: 'auto'
	});

	assert.match(code, /import GalleryEmbed from '\$lib\/components\/GalleryEmbed\.svelte';/);
	assert.match(
		code,
		/<GalleryEmbed gallery=\{\{"title":"About gallery","summary":"Marker-only component data"\}\} \/>/
	);
});

test('auto mode resolves reference-aware component data for a directory-backed markdown item', async () => {
	const fixture = await createAutoContextFixture();
	const source = await fs.readFile(fixture.postFilePath, 'utf8');
	const code = await renderMarkdown(source, {
		filename: fixture.postFilePath,
		projectRoot: fixture.projectRoot,
		resolveTentmanContext: 'auto'
	});

	assert.match(code, /import ProjectGallery from '\$lib\/components\/ProjectGallery\.svelte';/);
	assert.match(
		code,
		/<ProjectGallery gallery=\{\{"referenceToken":"featured-gallery","title":"Featured work","summary":"Selector-based references for markdown collections\."\}\} \/>/
	);
});

test('auto mode leaves unmanaged markdown files without Tentman render context', async () => {
	const fixture = await createAutoContextFixture();
	const source = await fs.readFile(fixture.unmanagedFilePath, 'utf8');
	const code = await renderMarkdown(source, {
		filename: fixture.unmanagedFilePath,
		projectRoot: fixture.projectRoot,
		resolveTentmanContext: 'auto'
	});

	assert.doesNotMatch(code, /GalleryEmbed|ProjectGallery/);
	assert.match(code, /Plain markdown/);
});

test('manual resolveRenderOptions values override auto-generated Tentman context', async () => {
	const fixture = await createAutoContextFixture();
	const source = await fs.readFile(fixture.aboutFilePath, 'utf8');
	const code = await renderMarkdown(source, {
		filename: fixture.aboutFilePath,
		projectRoot: fixture.projectRoot,
		resolveTentmanContext: 'auto',
		resolveRenderOptions() {
			return {
				referenceIndex: new Map([
					[
						'gallery-embed',
						new Map([
							[
								'gallery',
								{
									self: {
										title: 'Manual override gallery',
										summary: 'Manual render options should win.'
									}
								}
							]
						])
					]
				])
			};
		}
	});

	assert.match(
		code,
		/<GalleryEmbed gallery=\{\{"title":"Manual override gallery","summary":"Manual render options should win\."\}\} \/>/
	);
});
