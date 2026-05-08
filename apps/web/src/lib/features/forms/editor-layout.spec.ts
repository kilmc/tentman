import { describe, expect, it } from 'vitest';
import { resolveStructuredEditorSections } from './editor-layout';

describe('features/forms/editor-layout', () => {
	it('keeps all blocks primary when no aside is configured', () => {
		const blocks = [
			{ id: 'title', type: 'text', label: 'Title' },
			{ id: 'body', type: 'markdown', label: 'Body' }
		];

		expect(resolveStructuredEditorSections(blocks)).toEqual({
			primaryBlocks: blocks,
			asideBlocks: [],
			asideLabel: 'Details',
			hasAside: false
		});
	});

	it('resolves primary and aside blocks using explicit aside ordering', () => {
		const title = { id: 'title', type: 'text', label: 'Title' };
		const slug = { id: 'slug', type: 'text', label: 'Slug' };
		const published = { id: 'published', type: 'toggle', label: 'Published' };

		expect(
			resolveStructuredEditorSections([title, slug, published], {
				aside: ['published', 'slug'],
				asideLabel: 'Metadata'
			})
		).toEqual({
			primaryBlocks: [title],
			asideBlocks: [published, slug],
			asideLabel: 'Metadata',
			hasAside: true
		});
	});
});
