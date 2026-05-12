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
		remarkPlugins: [
			remarkDirective,
			tentmanComponents({
				componentsDir: options.componentsDir,
				onError: options.onError
			})
		]
	});

	if (typeof rendered?.code !== 'string') {
		throw new Error('Failed to compile markdown');
	}

	return rendered.code;
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
		fs.writeFile(path.join(componentDir, 'render.njk'), '<div>{{ title }}</div>\n'),
		fs.writeFile(path.join(componentDir, 'preview.njk'), '<div>{{ title }}</div>\n')
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
							referenceScope: {
								preview: 'container',
								render: 'full'
							}
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
		fs.writeFile(path.join(componentDir, 'render.njk'), '<div>{{ data.gallery.title }}</div>\n'),
		fs.writeFile(path.join(componentDir, 'preview.njk'), '<div>{{ data.title }}</div>\n')
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
	assert.match(
		rendered.code,
		/<GalleryEmbed gallery=\{\{"referenceToken":"main","title":"Homepage gallery"\}\} \/>/
	);
});
