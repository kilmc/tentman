import { describe, expect, it } from 'vitest';
import {
	addTagsToList,
	buildTagSuggestionsByField,
	filterTagSuggestions,
	getTagValidationMessage,
	splitTagInput
} from '$lib/features/forms/tags';

describe('features/forms/tags', () => {
	it('normalizes pasted tag input', () => {
		expect(splitTagInput('Design-System, field_notes process')).toEqual([
			'design-system',
			'field_notes',
			'process'
		]);
	});

	it('adds unique normalized tags to an existing list', () => {
		expect(addTagsToList(['process'], ['Process', 'field_notes'])).toEqual([
			'process',
			'field_notes'
		]);
	});

	it('validates slug-like tag values', () => {
		expect(getTagValidationMessage('field_notes')).toBeNull();
		expect(getTagValidationMessage('design-system')).toBeNull();
		expect(getTagValidationMessage('design system')).toBe(
			'Use lowercase letters, numbers, hyphens, and underscores'
		);
	});

	it('filters suggestions by query and selected tags', () => {
		expect(
			filterTagSuggestions({
				query: 'des',
				suggestions: ['field_notes', 'design-system', 'design-tools'],
				selectedTags: ['design-tools']
			})
		).toEqual(['design-system']);
	});

	it('builds collection suggestions by tag field id', () => {
		expect(
			buildTagSuggestionsByField(
				[{ id: 'topics', type: 'tags', label: 'Topics' }],
				[
					{ topics: ['design-system', 'process'] },
					{ topics: ['process', 'field_notes'] }
				]
			)
		).toEqual({
			topics: ['design-system', 'field_notes', 'process']
		});
	});
});
