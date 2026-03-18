import { describe, expect, it } from 'vitest';
import { buildFormData, getCardFields, normalizeFields } from './helpers';
import type { Config } from '$lib/types/config';

const config: Config = {
	label: 'Posts',
	idField: 'slug',
	template: './post.md',
	fields: [
		{ property: 'title', label: 'Title', type: 'text', show: 'primary', required: true },
		{ property: 'slug', label: 'Slug', type: 'text', required: true },
		{ property: 'published', label: 'Published', type: 'boolean', show: 'secondary' },
		{
			property: 'tags',
			label: 'Tags',
			type: 'array',
			fields: [{ property: 'name', label: 'Name', type: 'text' }]
		}
	]
};

describe('forms/helpers', () => {
	it('builds defaults and preserves provided values', () => {
		expect(buildFormData(config, { title: 'Hello' })).toEqual({
			title: 'Hello',
			slug: '',
			published: false,
			tags: []
		});
	});

	it('normalizes array-based field configs', () => {
		expect(normalizeFields(config.fields)).toMatchObject({
			title: { type: 'text', label: 'Title' },
			published: { type: 'boolean', label: 'Published', show: 'secondary' }
		});
	});

	it('derives card fields from show metadata', () => {
		expect(getCardFields(config)).toEqual({
			primary: [['title', expect.objectContaining({ type: 'text' })]],
			secondary: [['published', expect.objectContaining({ type: 'boolean' })]]
		});
	});
});
