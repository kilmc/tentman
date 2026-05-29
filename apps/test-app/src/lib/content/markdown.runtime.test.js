import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderMarkdown } from './markdown.ts';

async function createReferenceComponentFixture() {
	const componentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tentman-test-app-components-'));
	const componentDir = path.join(componentsDir, 'project-gallery');

	await fs.mkdir(componentDir, { recursive: true });
	await Promise.all([
		fs.writeFile(
			path.join(componentDir, 'component.json'),
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
					}
				},
				null,
				'\t'
			)
		),
		fs.writeFile(
			path.join(componentDir, 'render.njk'),
			'<section class="project-gallery"><h3>{{ data.gallery.title }}</h3><p>{{ data.gallery.summary }}</p></section>\n'
		)
	]);

	return componentsDir;
}

function createReferenceRenderOptions(componentsDir, contentItem) {
	return {
		componentsDir,
		contentItem,
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
						referenceFor: 'project-gallery:galleryRef'
					},
					{
						id: 'title',
						type: 'text'
					},
					{
						id: 'summary',
						type: 'textarea'
					}
				]
			}
		],
		resolveStructuredBlocks(block) {
			return Array.isArray(block.blocks) ? block.blocks : null;
		}
	};
}

test('renders referenced block content components with contentItem and referenceIndex context', async () => {
	const componentsDir = await createReferenceComponentFixture();
	const contentItem = {
		body: '::project-gallery{galleryRef="featured-gallery"}',
		gallery: {
			referenceToken: 'featured-gallery',
			title: 'Featured work',
			summary: 'A reference-aware runtime render in the test app.'
		}
	};

	const html = await renderMarkdown(contentItem.body, createReferenceRenderOptions(componentsDir, contentItem));

	assert.match(html, /<section class="project-gallery">/);
	assert.match(html, /Featured work/);
	assert.match(html, /A reference-aware runtime render in the test app\./);
});

test('fails when a referenced block content component cannot resolve its token', async () => {
	const componentsDir = await createReferenceComponentFixture();
	const contentItem = {
		body: '::project-gallery{galleryRef="featured-gallery"}',
		gallery: {
			referenceToken: 'different-token',
			title: 'Featured work',
			summary: 'This should not resolve.'
		}
	};

	await assert.rejects(
		renderMarkdown(contentItem.body, createReferenceRenderOptions(componentsDir, contentItem)),
		/project-gallery:galleryRef.*featured-gallery/
	);
});
