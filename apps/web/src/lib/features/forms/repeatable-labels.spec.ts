import { describe, expect, it } from 'vitest';
import { getRepeatableItemLabel } from './repeatable-labels';

describe('features/forms/repeatable-labels', () => {
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
