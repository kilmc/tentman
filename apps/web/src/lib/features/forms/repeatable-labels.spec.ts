import { describe, expect, it } from 'vitest';
import { getRepeatableItemLabel } from './repeatable-labels';

describe('features/forms/repeatable-labels', () => {
	it('uses an explicit text item label when configured', () => {
		expect(
			getRepeatableItemLabel(
				{
					title: 'Fallback title',
					summary: '  Intro   section '
				},
				0,
				[
					{ id: 'title', type: 'text', label: 'Title' },
					{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true }
				],
				'Section'
			)
		).toBe('Section 1: Intro section');
	});

	it('prefers human text fields over image paths', () => {
		expect(
			getRepeatableItemLabel(
				{
					src: '/images/hero.jpg',
					alt: 'Opening view'
				},
				0,
				[
					{ id: 'src', type: 'image', label: 'Image path' },
					{ id: 'alt', type: 'text', label: 'Alt text' }
				],
				'Image'
			)
		).toBe('Image 1: Opening view');
	});

	it('falls back to image paths when no human text value exists', () => {
		expect(
			getRepeatableItemLabel(
				{
					src: '/images/hero.jpg',
					alt: ''
				},
				1,
				[
					{ id: 'src', type: 'image', label: 'Image path' },
					{ id: 'alt', type: 'text', label: 'Alt text' }
				],
				'Image'
			)
		).toBe('Image 2: /images/hero.jpg');
	});

	it('falls back to default repeatable labels when more than one explicit item label is declared', () => {
		expect(
			getRepeatableItemLabel(
				{
					title: 'Opening view',
					summary: 'Ignore me'
				},
				0,
				[
					{ id: 'title', type: 'text', label: 'Title', isItemLabel: true },
					{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true }
				],
				'Section'
			)
		).toBe('Section 1: Opening view');
	});

	it('uses the item label and ordinal for empty records', () => {
		expect(
			getRepeatableItemLabel(
				{
					title: ''
				},
				2,
				[{ id: 'title', type: 'text', label: 'Title' }],
				'Section'
			)
		).toBe('Section 3');
	});
});
