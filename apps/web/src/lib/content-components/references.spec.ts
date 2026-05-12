import { describe, expect, it } from 'vitest';
import { createBlockRegistry } from '$lib/blocks/registry';
import { collectContentComponentReferenceState } from './references';

describe('collectContentComponentReferenceState', () => {
	it('collects sibling object references and labels for the current content item', () => {
		const referenceState = collectContentComponentReferenceState({
			blocks: [
				{
					id: 'body',
					type: 'markdown',
					label: 'Body',
					components: ['gallery-embed']
				},
				{
					id: 'gallery',
					type: 'block',
					label: 'Gallery',
					blocks: [
						{
							id: 'referenceToken',
							type: 'text',
							label: 'Reference token',
							referenceFor: ['gallery-embed:galleryRef']
						},
						{
							id: 'title',
							type: 'text',
							label: 'Title',
							referenceLabel: true
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
			blockRegistry: createBlockRegistry([])
		});

		expect(referenceState.errors).toEqual([]);
		expect(referenceState.referenceIndex.get('gallery-embed:galleryRef')?.get('main')).toMatchObject({
			token: 'main',
			container: {
				referenceToken: 'main',
				title: 'Homepage gallery'
			}
		});
		expect(referenceState.optionsByBinding.get('gallery-embed:galleryRef')).toEqual([
			{
				value: 'main',
				label: 'Homepage gallery'
			}
		]);
	});

	it('collects top-level primitive references as first-class bindings', () => {
		const referenceState = collectContentComponentReferenceState({
			blocks: [
				{
					id: 'heroToken',
					type: 'text',
					label: 'Hero token',
					referenceFor: ['hero-embed:heroRef']
				},
				{
					id: 'title',
					type: 'text',
					label: 'Title',
					referenceLabel: true
				}
			],
			contentItem: {
				heroToken: 'main-hero',
				title: 'Homepage hero'
			},
			blockRegistry: createBlockRegistry([])
		});

		expect(referenceState.errors).toEqual([]);
		expect(referenceState.referenceIndex.get('hero-embed:heroRef')?.get('main-hero')).toMatchObject({
			token: 'main-hero',
			self: 'main-hero',
			container: {
				heroToken: 'main-hero',
				title: 'Homepage hero'
			},
			full: {
				heroToken: 'main-hero',
				title: 'Homepage hero'
			}
		});
		expect(referenceState.optionsByBinding.get('hero-embed:heroRef')).toEqual([
			{
				value: 'main-hero',
				label: 'Homepage hero'
			}
		]);
	});

	it('collects nested non-collection object references and labels', () => {
		const referenceState = collectContentComponentReferenceState({
			blocks: [
				{
					id: 'seo',
					type: 'block',
					label: 'SEO',
					blocks: [
						{
							id: 'openGraph',
							type: 'block',
							label: 'Open graph',
							blocks: [
								{
									id: 'imageToken',
									type: 'text',
									label: 'Image token',
									referenceFor: ['og-image:assetRef']
								},
								{
									id: 'title',
									type: 'text',
									label: 'Title',
									referenceLabel: true
								}
							]
						}
					]
				}
			],
			contentItem: {
				seo: {
					openGraph: {
						imageToken: 'cover-image',
						title: 'Open graph cover'
					}
				}
			},
			blockRegistry: createBlockRegistry([])
		});

		expect(referenceState.errors).toEqual([]);
		expect(referenceState.referenceIndex.get('og-image:assetRef')?.get('cover-image')).toMatchObject({
			token: 'cover-image',
			container: {
				imageToken: 'cover-image',
				title: 'Open graph cover'
			}
		});
		expect(referenceState.optionsByBinding.get('og-image:assetRef')).toEqual([
			{
				value: 'cover-image',
				label: 'Open graph cover'
			}
		]);
	});

	it('does not infer reference options from unrelated string fields that share a token value', () => {
		const referenceState = collectContentComponentReferenceState({
			blocks: [
				{
					id: 'gallery',
					type: 'block',
					label: 'Gallery',
					blocks: [
						{
							id: 'referenceToken',
							type: 'text',
							label: 'Reference token',
							referenceFor: ['gallery-embed:galleryRef']
						},
						{
							id: 'title',
							type: 'text',
							label: 'Title',
							referenceLabel: true
						}
					]
				},
				{
					id: 'alias',
					type: 'text',
					label: 'Alias'
				}
			],
			contentItem: {
				gallery: {
					referenceToken: 'main',
					title: 'Homepage gallery'
				},
				alias: 'main'
			},
			blockRegistry: createBlockRegistry([])
		});

		expect(referenceState.errors).toEqual([]);
		expect(referenceState.optionsByBinding.get('gallery-embed:galleryRef')).toEqual([
			{
				value: 'main',
				label: 'Homepage gallery'
			}
		]);
	});
});
