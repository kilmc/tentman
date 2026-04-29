import { describe, expect, it } from 'vitest';
import { containsNestedStructuredCollection } from './object-panel';

describe('features/forms/object-panel', () => {
	it('returns false for structured objects without nested collections', () => {
		expect(
			containsNestedStructuredCollection(
				[
					{ id: 'title', type: 'text', label: 'Title' },
					{
						id: 'meta',
						type: 'block',
						label: 'Meta',
						blocks: [{ id: 'summary', type: 'textarea', label: 'Summary' }]
					}
				],
				{ get: () => undefined }
			)
		).toBe(false);
	});

	it('returns true when a descendant structured field is a collection', () => {
		expect(
			containsNestedStructuredCollection(
				[
					{
						id: 'gallery',
						type: 'block',
						label: 'Gallery',
						blocks: [
							{ id: 'layout', type: 'text', label: 'Layout' },
							{
								id: 'images',
								type: 'block',
								label: 'Images',
								collection: true,
								blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
							}
						]
					}
				],
				{ get: () => undefined }
			)
		).toBe(true);
	});
});
