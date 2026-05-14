import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
	collectContentComponentReferenceIndex,
	discoverContentComponents,
	getContentComponentReferenceAttribute,
	getContentComponentReferenceScope,
	getContentComponentRenderTarget,
	loadContentComponent,
	normalizeContentComponentInstance,
	resolveContentComponentInstance,
	resolveContentComponentRenderTarget,
	renderContentComponent,
	validateContentComponentInstance,
	validateContentComponent
} from './index.js';
import { contentComponentsFixturesRoot } from './test-paths.test-helper.js';

function getFixtureRoot(name) {
	return path.join(contentComponentsFixturesRoot, name);
}

test('loads and validates a content component from disk', async () => {
	const component = validateContentComponent(
		await loadContentComponent(path.join(getFixtureRoot('valid-inline'), 'buy-button'))
	);

	assert.equal(component.definition.id, 'buy-button');
	assert.equal(component.definition.name, 'buy-button');
	assert.equal(component.definition.kind, 'inline');
	assert.deepEqual(component.definition.attributes, {
		href: {
			type: 'string',
			required: true,
			valueFromMarkdownLabel: false
		},
		label: {
			type: 'string',
			required: true,
			valueFromMarkdownLabel: true
		},
		variant: {
			type: 'enum',
			required: false,
			valueFromMarkdownLabel: false,
			default: 'default',
			options: ['default', 'secondary']
		}
	});
	assert.equal(component.definition.editor, undefined);
	assert.match(component.renderTemplatePath, /render\.njk$/);
	assert.match(component.previewTemplatePath, /preview\.njk$/);
});

test('discovers, normalizes, and renders a buy-button component end to end', async () => {
	const [component] = await discoverContentComponents({
		componentsDir: getFixtureRoot('valid-inline')
	});

	assert.equal(component?.definition.name, 'buy-button');

	const instance = normalizeContentComponentInstance(component, {
		markdownLabel: 'Buy <Tickets>',
		attributes: {
			href: '/tickets?x=<y>',
			variant: 'secondary'
		}
	});

	assert.deepEqual(instance, {
		componentId: 'buy-button',
		componentName: 'buy-button',
		kind: 'inline',
		attributes: {
			href: '/tickets?x=<y>',
			label: 'Buy <Tickets>',
			variant: 'secondary'
		}
	});

	assert.equal(
		renderContentComponent(component, instance, 'render').trim(),
		'<a class="buy-button buy-button--secondary" href="/tickets?x=&lt;y&gt;" data-buy-button data-variant="secondary">Buy &lt;Tickets&gt;</a>'
	);
	assert.equal(
		renderContentComponent(component, instance, 'preview').trim(),
		'<span class="tm-component-preview tm-component-preview--buy-button tm-component-preview--secondary" data-tm-component="buy-button">Buy button: Buy &lt;Tickets&gt;</span>'
	);
});

test('discovers a valid block component', async () => {
	const [component] = await discoverContentComponents({
		componentsDir: getFixtureRoot('valid-block')
	});

	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			title: 'Latest update',
			tone: 'warning'
		}
	});

	assert.equal(component?.definition.kind, 'block');
	assert.deepEqual(instance.attributes, {
		title: 'Latest update',
		tone: 'warning'
	});
});

test('throws when a required template is missing', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('invalid-missing-template')
		}),
		/Missing required content component file: .*preview\.njk/
	);
});

test('throws when an enum definition is invalid', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('invalid-enum')
		}),
		/default must match one of the enum options/
	);
});

test('throws when duplicate component ids are discovered', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('duplicate-ids')
		}),
		/Duplicate content component ids found: duplicate-id/
	);
});

test('throws when duplicate component names are discovered', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('duplicate-names')
		}),
		/Duplicate content component names found: shared-name/
	);
});

test('normalizes defaults and validates required and enum attributes', async () => {
	const [component] = await discoverContentComponents({
		componentsDir: getFixtureRoot('valid-inline')
	});

	const withDefaults = normalizeContentComponentInstance(component, {
		markdownLabel: 'Buy tickets',
		attributes: {
			href: '/tickets'
		}
	});

	assert.equal(withDefaults.attributes.variant, 'default');

	assert.throws(
		() =>
			normalizeContentComponentInstance(component, {
				markdownLabel: 'Buy tickets'
			}),
		/Content component attribute href is required/
	);
	assert.throws(
		() =>
			normalizeContentComponentInstance(component, {
				markdownLabel: 'Buy tickets',
				attributes: {
					href: '/tickets',
					variant: 'loud'
				}
			}),
		/Content component attribute variant must be one of: default, secondary/
	);
	assert.throws(
		() =>
			normalizeContentComponentInstance(component, {
				markdownLabel: 'Buy tickets',
				attributes: {
					href: '/tickets',
					extra: 'nope'
				}
			}),
		/Unknown content component attribute: extra/
	);
});

test('normalizes reference metadata and resolves shared preview/render context', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/gallery-embed',
		componentJsonPath: 'src/lib/content-components/gallery-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/gallery-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/gallery-embed/preview.njk',
		renderTemplateSource: '<div>{{ attributes.variant }} {{ data.title }}</div>',
		previewTemplateSource:
			'<div class="tm-component-preview">{% if data %}{{ data.title }}{% else %}Missing{% endif %}</div>',
		definition: {
			id: 'gallery-embed',
			name: 'gallery-embed',
			kind: 'block',
			attributes: {
				galleryId: {
					type: 'string',
					reference: true,
					referenceScope: {
						preview: 'container',
						render: 'full'
					},
					required: true
				},
				variant: {
					type: 'enum',
					default: 'default',
					options: ['default', 'compact']
				}
			},
			render: {
				mdsvex: {
					from: '$lib/components/GalleryEmbed.svelte',
					component: 'GalleryEmbed',
					props: {
						images: 'data.galleries',
						variant: 'attributes.variant'
					}
				}
			}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			galleryId: 'city-sketches',
			variant: 'compact'
		}
	});
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'body',
				type: 'markdown'
			},
			{
				id: 'galleries',
				type: 'block',
				collection: true,
				blocks: [
					{
						id: 'id',
						type: 'text',
						referenceFor: 'gallery-embed:galleryId'
					},
					{
						id: 'title',
						type: 'text'
					}
				]
			}
		],
		contentItem: {
			body: '',
			galleries: [
				{
					id: 'city-sketches',
					title: 'City sketches'
				}
			]
		},
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(getContentComponentReferenceAttribute(component), {
		attributeId: 'galleryId',
		definition: component.definition.attributes.galleryId,
		binding: 'gallery-embed:galleryId'
	});
	assert.equal(getContentComponentReferenceScope(component, 'preview'), 'container');
	assert.equal(getContentComponentReferenceScope(component, 'render'), 'full');
	assert.deepEqual(getContentComponentRenderTarget(component, 'mdsvex'), {
		from: '$lib/components/GalleryEmbed.svelte',
		component: 'GalleryEmbed',
		props: {
			images: 'data.galleries',
			variant: 'attributes.variant'
		}
	});
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {
			galleryId: 'city-sketches',
			variant: 'compact'
		},
		data: {
			id: 'city-sketches',
			title: 'City sketches'
		}
	});
	assert.deepEqual(resolveContentComponentRenderTarget(component, instance, 'mdsvex', { referenceIndex }), {
		from: '$lib/components/GalleryEmbed.svelte',
		component: 'GalleryEmbed',
		props: {
			images: [
				{
					id: 'city-sketches',
					title: 'City sketches'
				}
			],
			variant: 'compact'
		}
	});
	assert.equal(
		renderContentComponent(component, instance, 'preview', { referenceIndex }).trim(),
		'<div class="tm-component-preview">City sketches</div>'
	);
});

test('flags duplicate and unresolved reference tokens', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/project-gallery',
		componentJsonPath: 'src/lib/content-components/project-gallery/component.json',
		renderTemplatePath: 'src/lib/content-components/project-gallery/render.njk',
		previewTemplatePath: 'src/lib/content-components/project-gallery/preview.njk',
		renderTemplateSource: '<div>{{ data.title }}</div>',
		previewTemplateSource: '<div>{{ data.title }}</div>',
		definition: {
			id: 'project-gallery',
			name: 'project-gallery',
			kind: 'block',
			attributes: {
				galleryId: {
					type: 'string',
					reference: true,
					referenceScope: 'container',
					required: true
				}
			}
		}
	});
	const duplicateIndex = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'galleries',
				type: 'block',
				collection: true,
				blocks: [
					{
						id: 'id',
						type: 'text',
						referenceFor: 'project-gallery:galleryId'
					}
				]
			}
		],
		contentItem: {
			galleries: [{ id: 'shared' }, { id: 'shared' }]
		},
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});
	const missingInstance = normalizeContentComponentInstance(component, {
		attributes: {
			galleryId: 'missing'
		}
	});

	assert.equal(duplicateIndex.errors.length, 1);
	assert.match(duplicateIndex.errors[0], /Duplicate content reference token "shared"/);
	assert.deepEqual(validateContentComponentInstance(component, missingInstance, {
		referenceIndex: duplicateIndex.referenceIndex
	}), ['Content component reference "project-gallery:galleryId" could not resolve token "missing"']);
});

test('resolves marker-only bindings from a single explicit structured source', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/project-gallery-embed',
		componentJsonPath: 'src/lib/content-components/project-gallery-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/project-gallery-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/project-gallery-embed/preview.njk',
		renderTemplateSource: '<div>{{ data.layout }}</div>',
		previewTemplateSource: '<div>{{ data.layout }}</div>',
		definition: {
			id: 'project-gallery-embed',
			name: 'project-gallery-embed',
			kind: 'block',
			attributes: {}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {}
	});
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'body',
				type: 'markdown'
			},
			{
				id: 'gallery',
				type: 'block',
				referenceFor: 'project-gallery-embed',
				blocks: [
					{
						id: 'layout',
						type: 'select'
					},
					{
						id: 'images',
						type: 'imageGallery'
					}
				]
			}
		],
		contentItem: {
			body: '::project-gallery-embed',
			gallery: {
				layout: 'inline',
				images: [{ src: '/gallery.jpg' }]
			}
		},
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {},
		data: {
			layout: 'inline',
			images: [{ src: '/gallery.jpg' }]
		}
	});
	assert.deepEqual(validateContentComponentInstance(component, instance, { referenceIndex }), []);
});

test('reports unresolved and ambiguous marker-only bindings', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/project-gallery-embed',
		componentJsonPath: 'src/lib/content-components/project-gallery-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/project-gallery-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/project-gallery-embed/preview.njk',
		renderTemplateSource: '<div>{{ data.layout }}</div>',
		previewTemplateSource: '<div>{{ data.layout }}</div>',
		definition: {
			id: 'project-gallery-embed',
			name: 'project-gallery-embed',
			kind: 'block',
			attributes: {}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {}
	});
	const unresolvedIndex = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'gallery',
				type: 'block',
				referenceFor: 'project-gallery-embed',
				blocks: [
					{
						id: 'layout',
						type: 'select'
					}
				]
			}
		],
		contentItem: {},
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});
	const ambiguousIndex = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'galleries',
				type: 'block',
				collection: true,
				referenceFor: 'project-gallery-embed',
				blocks: [
					{
						id: 'layout',
						type: 'select'
					}
				]
			}
		],
		contentItem: {
			galleries: [{ layout: 'inline' }, { layout: 'stack' }]
		},
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.deepEqual(validateContentComponentInstance(component, instance, {
		referenceIndex: unresolvedIndex.referenceIndex
	}), ['Content component reference "project-gallery-embed" could not resolve a bound source in this entry']);
	assert.deepEqual(validateContentComponentInstance(component, instance, {
		referenceIndex: ambiguousIndex.referenceIndex
	}), [
		'Content component reference "project-gallery-embed" is ambiguous because this entry has 2 bound sources'
	]);
});

test('resolves sibling object references when the marker relies on a default reference attribute', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/gallery-embed',
		componentJsonPath: 'src/lib/content-components/gallery-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/gallery-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/gallery-embed/preview.njk',
		renderTemplateSource: '<div>{{ data.gallery.title }}</div>',
		previewTemplateSource: '<div>{{ data.title }}</div>',
		definition: {
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
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {}
	});
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
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
		contentItem: {
			body: '::gallery-embed',
			gallery: {
				referenceToken: 'main',
				title: 'Homepage gallery'
			}
		},
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(instance.attributes, {
		galleryRef: 'main'
	});
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {
			galleryRef: 'main'
		},
		data: {
			referenceToken: 'main',
			title: 'Homepage gallery'
		}
	});
	assert.deepEqual(resolveContentComponentRenderTarget(component, instance, 'mdsvex', { referenceIndex }), {
		from: '$lib/components/GalleryEmbed.svelte',
		component: 'GalleryEmbed',
		props: {
			gallery: {
				referenceToken: 'main',
				title: 'Homepage gallery'
			}
		}
	});
	assert.deepEqual(validateContentComponentInstance(component, instance, { referenceIndex }), []);
	assert.equal(
		renderContentComponent(component, instance, 'preview', { referenceIndex }).trim(),
		'<div>Homepage gallery</div>'
	);
});

test('treats top-level primitive reference sources as first-class runtime bindings', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/hero-embed',
		componentJsonPath: 'src/lib/content-components/hero-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/hero-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/hero-embed/preview.njk',
		renderTemplateSource: '<div>{{ data.title }}</div>',
		previewTemplateSource: '<div>{{ data.title }}</div>',
		definition: {
			id: 'hero-embed',
			name: 'hero-embed',
			kind: 'block',
			attributes: {
				heroRef: {
					type: 'string',
					reference: true,
					referenceScope: {
						preview: 'container',
						render: 'full'
					},
					required: true
				}
			},
			render: {
				mdsvex: {
					from: '$lib/components/HeroEmbed.svelte',
					component: 'HeroEmbed',
					props: {
						title: 'data.title',
						token: 'attributes.heroRef'
					}
				}
			}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			heroRef: 'main-hero'
		}
	});
	const contentItem = {
		body: '::hero-embed{heroRef="main-hero"}',
		heroRef: 'main-hero',
		title: 'Homepage hero'
	};
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'body',
				type: 'markdown'
			},
			{
				id: 'heroRef',
				type: 'text',
				referenceFor: 'hero-embed:heroRef'
			},
			{
				id: 'title',
				type: 'text'
			}
		],
		contentItem,
		resolveStructuredBlocks() {
			return null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {
			heroRef: 'main-hero'
		},
		data: {
			body: '::hero-embed{heroRef="main-hero"}',
			heroRef: 'main-hero',
			title: 'Homepage hero'
		}
	});
	assert.deepEqual(resolveContentComponentRenderTarget(component, instance, 'mdsvex', { referenceIndex }), {
		from: '$lib/components/HeroEmbed.svelte',
		component: 'HeroEmbed',
		props: {
			title: 'Homepage hero',
			token: 'main-hero'
		}
	});
	assert.deepEqual(validateContentComponentInstance(component, instance, { referenceIndex }), []);
	assert.equal(
		renderContentComponent(component, instance, 'preview', { referenceIndex }).trim(),
		'<div>Homepage hero</div>'
	);
});

test('resolves string-form self reference scopes to the token value itself', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/tag-pill',
		componentJsonPath: 'src/lib/content-components/tag-pill/component.json',
		renderTemplatePath: 'src/lib/content-components/tag-pill/render.njk',
		previewTemplatePath: 'src/lib/content-components/tag-pill/preview.njk',
		renderTemplateSource: '<span>{{ data }}</span>',
		previewTemplateSource: '<span>{{ data }}</span>',
		definition: {
			id: 'tag-pill',
			name: 'tag-pill',
			kind: 'inline',
			attributes: {
				tagRef: {
					type: 'string',
					reference: true,
					referenceScope: 'self',
					required: true
				}
			}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			tagRef: 'featured'
		}
	});
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'tagRef',
				type: 'text',
				referenceFor: 'tag-pill:tagRef'
			}
		],
		contentItem: {
			tagRef: 'featured'
		},
		resolveStructuredBlocks() {
			return null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {
			tagRef: 'featured'
		},
		data: 'featured'
	});
});

test('resolves string-form full reference scopes to the full content item', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/hero-embed',
		componentJsonPath: 'src/lib/content-components/hero-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/hero-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/hero-embed/preview.njk',
		renderTemplateSource: '<div>{{ data.title }}</div>',
		previewTemplateSource: '<div>{{ data.title }}</div>',
		definition: {
			id: 'hero-embed',
			name: 'hero-embed',
			kind: 'block',
			attributes: {
				heroRef: {
					type: 'string',
					reference: true,
					referenceScope: 'full',
					required: true
				}
			}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			heroRef: 'main-hero'
		}
	});
	const contentItem = {
		heroRef: 'main-hero',
		title: 'Homepage hero'
	};
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'heroRef',
				type: 'text',
				referenceFor: 'hero-embed:heroRef'
			},
			{
				id: 'title',
				type: 'text'
			}
		],
		contentItem,
		resolveStructuredBlocks() {
			return null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {
			heroRef: 'main-hero'
		},
		data: contentItem
	});
});

test('treats nested non-collection object reference sources as first-class runtime bindings', () => {
	const component = validateContentComponent({
		directory: 'src/lib/content-components/social-card-embed',
		componentJsonPath: 'src/lib/content-components/social-card-embed/component.json',
		renderTemplatePath: 'src/lib/content-components/social-card-embed/render.njk',
		previewTemplatePath: 'src/lib/content-components/social-card-embed/preview.njk',
		renderTemplateSource: '<div>{{ data.seo.twitterCard.title }}</div>',
		previewTemplateSource: '<div>{{ data.title }}</div>',
		definition: {
			id: 'social-card-embed',
			name: 'social-card-embed',
			kind: 'block',
			attributes: {
				cardRef: {
					type: 'string',
					reference: true,
					referenceScope: {
						preview: 'container',
						render: 'full'
					},
					required: true
				}
			},
			render: {
				mdsvex: {
					from: '$lib/components/SocialCardEmbed.svelte',
					component: 'SocialCardEmbed',
					props: {
						card: 'data.seo.twitterCard'
					}
				}
			}
		}
	});
	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			cardRef: 'twitter-cover'
		}
	});
	const contentItem = {
		body: '::social-card-embed{cardRef="twitter-cover"}',
		seo: {
			openGraph: {
				imageToken: 'og-cover',
				title: 'Open graph cover'
			},
			twitterCard: {
				imageToken: 'twitter-cover',
				title: 'Twitter card cover'
			}
		}
	};
	const { referenceIndex, errors } = collectContentComponentReferenceIndex({
		blocks: [
			{
				id: 'body',
				type: 'markdown'
			},
			{
				id: 'seo',
				type: 'block',
				blocks: [
					{
						id: 'openGraph',
						type: 'block',
						blocks: [
							{
								id: 'imageToken',
								type: 'text',
								referenceFor: 'social-card-embed:cardRef'
							},
							{
								id: 'title',
								type: 'text'
							}
						]
					},
					{
						id: 'twitterCard',
						type: 'block',
						blocks: [
							{
								id: 'imageToken',
								type: 'text',
								referenceFor: 'social-card-embed:cardRef'
							},
							{
								id: 'title',
								type: 'text'
							}
						]
					}
				]
			}
		],
		contentItem,
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.deepEqual(errors, []);
	assert.deepEqual(resolveContentComponentInstance(component, instance, 'preview', { referenceIndex }), {
		attributes: {
			cardRef: 'twitter-cover'
		},
		data: {
			imageToken: 'twitter-cover',
			title: 'Twitter card cover'
		}
	});
	assert.deepEqual(resolveContentComponentRenderTarget(component, instance, 'mdsvex', { referenceIndex }), {
		from: '$lib/components/SocialCardEmbed.svelte',
		component: 'SocialCardEmbed',
		props: {
			card: {
				imageToken: 'twitter-cover',
				title: 'Twitter card cover'
			}
		}
	});
	assert.deepEqual(validateContentComponentInstance(component, instance, { referenceIndex }), []);
	assert.equal(
		renderContentComponent(component, instance, 'preview', { referenceIndex }).trim(),
		'<div>Twitter card cover</div>'
	);
});
