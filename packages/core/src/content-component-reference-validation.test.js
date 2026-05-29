import assert from 'node:assert/strict';
import test from 'node:test';
import {
	validateContentComponent,
	validateContentComponentReferenceBindings
} from './index.js';

function createComponent(definition) {
	return validateContentComponent({
		directory: `src/lib/content-components/${definition.id}`,
		componentJsonPath: `src/lib/content-components/${definition.id}/component.json`,
		renderTemplatePath: `src/lib/content-components/${definition.id}/render.njk`,
		renderTemplateSource: '<div></div>',
		definition
	});
}

test('reports missing component, missing attribute, and non-reference attribute bindings', () => {
	const diagnostics = validateContentComponentReferenceBindings({
		components: [
			createComponent({
				id: 'gallery-embed',
				name: 'gallery-embed',
				kind: 'block',
				attributes: {
					galleryRef: {
						type: 'string',
						reference: true,
						referenceScope: 'container',
						required: true
					},
					title: {
						type: 'string'
					}
				}
			})
		],
		blockTrees: [
			{
				path: 'tentman/configs/projects.tentman.json',
				label: 'Projects config',
				blocks: [
					{
						id: 'missingComponentToken',
						type: 'text',
						referenceFor: 'missing-widget:galleryRef'
					},
					{
						id: 'missingAttributeToken',
						type: 'text',
						referenceFor: 'gallery-embed:missingRef'
					},
					{
						id: 'nonReferenceToken',
						type: 'text',
						referenceFor: 'gallery-embed:title'
					}
				]
			}
		]
	});

	assert.deepEqual(
		diagnostics.map((diagnostic) => diagnostic.code),
		[
			'content-components.reference-binding.missing-component',
			'content-components.reference-binding.missing-attribute',
			'content-components.reference-binding.non-reference-attribute'
		]
	);
});

test('reports structured/primitive binding mode mismatches', () => {
	const diagnostics = validateContentComponentReferenceBindings({
		components: [
			createComponent({
				id: 'project-gallery-embed',
				name: 'project-gallery-embed',
				kind: 'block',
				attributes: {}
			}),
			createComponent({
				id: 'gallery-embed',
				name: 'gallery-embed',
				kind: 'block',
				attributes: {
					galleryRef: {
						type: 'string',
						reference: true,
						referenceScope: 'container',
						required: true
					}
				}
			})
		],
		blockTrees: [
			{
				path: 'tentman/configs/projects.tentman.json',
				label: 'Projects config',
				blocks: [
					{
						id: 'galleryToken',
						type: 'text',
						referenceFor: 'project-gallery-embed'
					},
					{
						id: 'gallery',
						type: 'block',
						referenceFor: 'gallery-embed:galleryRef',
						blocks: [{ id: 'title', type: 'text' }]
					},
					{
						id: 'gallerySelectorMismatch',
						type: 'block',
						referenceFor: 'gallery-embed',
						blocks: [{ id: 'title', type: 'text' }]
					}
				]
			}
		],
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.deepEqual(
		diagnostics.map((diagnostic) => diagnostic.code),
		[
			'content-components.reference-binding.marker-on-primitive',
			'content-components.reference-binding.selector-on-structured',
			'content-components.reference-binding.marker-requires-nonselector-component'
		]
	);
});

test('reports duplicate reference tokens per content item', () => {
	const diagnostics = validateContentComponentReferenceBindings({
		components: [
			createComponent({
				id: 'project-gallery',
				name: 'project-gallery',
				kind: 'block',
				attributes: {
					galleryRef: {
						type: 'string',
						reference: true,
						referenceScope: 'container',
						required: true
					}
				}
			})
		],
		blockTrees: [
			{
				path: 'tentman/configs/projects.tentman.json',
				label: 'Projects config',
				contentPath: 'src/content/pages/projects.json',
				blocks: [
					{
						id: 'galleries',
						type: 'block',
						collection: true,
						blocks: [
							{
								id: 'referenceToken',
								type: 'text',
								referenceFor: 'project-gallery:galleryRef'
							}
						]
					}
				],
				contentItems: [
					{
						title: 'Projects',
						galleries: [{ referenceToken: 'shared' }, { referenceToken: 'shared' }]
					}
				]
			}
		],
		resolveStructuredBlocks(block) {
			return block.blocks ?? null;
		}
	});

	assert.equal(diagnostics.length, 1);
	assert.equal(
		diagnostics[0]?.code,
		'content-components.reference-binding.duplicate-token'
	);
	assert.match(diagnostics[0]?.message ?? '', /Duplicate content reference token "shared"/);
	assert.equal(diagnostics[0]?.path, 'src/content/pages/projects.json');
});
