import { describe, expect, it } from 'vitest';
import { BUILT_IN_BLOCK_ADAPTERS } from '$lib/blocks/adapters/builtins';

describe('BUILT_IN_BLOCK_ADAPTERS', () => {
	it('provides the expected default values for primitive blocks', () => {
		expect(BUILT_IN_BLOCK_ADAPTERS.text.getDefaultValue({ id: 'title', type: 'text' })).toBe('');
		expect(BUILT_IN_BLOCK_ADAPTERS.number.getDefaultValue({ id: 'order', type: 'number' })).toBe(0);
		expect(BUILT_IN_BLOCK_ADAPTERS.boolean.getDefaultValue({ id: 'published', type: 'boolean' })).toBe(false);
		expect(BUILT_IN_BLOCK_ADAPTERS.image.getDefaultValue({ id: 'heroImage', type: 'image' })).toBe('');
	});

	it('validates built-in primitive values with usage metadata', () => {
		expect(
			BUILT_IN_BLOCK_ADAPTERS.text.validate?.('', {
				id: 'title',
				type: 'text',
				label: 'Title',
				required: true,
				minLength: 3
			})
		).toEqual(['Title is required']);

		expect(
			BUILT_IN_BLOCK_ADAPTERS.email.validate?.('not-an-email', {
				id: 'email',
				type: 'email',
				label: 'Email'
			})
		).toEqual(['Email must be a valid email address']);

		expect(
			BUILT_IN_BLOCK_ADAPTERS.number.validate?.('abc', {
				id: 'rank',
				type: 'number',
				label: 'Rank'
			})
		).toEqual(['Rank must be a valid number']);
	});
});
