import { describe, expect, it } from 'vitest';
import { isParsedContentConfig, parseConfigFile, type ParsedContentConfig } from '$lib/config/parse';
import { buildFormData, getCardFields, normalizeFields } from './helpers';

function parseContentConfigFixture(content: string): ParsedContentConfig {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error('Expected content config fixture');
	}

	return parsed;
}

const config = parseContentConfigFixture(`{
	"type": "content",
	"label": "Posts",
	"itemLabel": "Post",
	"collection": true,
	"idField": "slug",
	"content": {
		"mode": "directory",
		"path": "./posts",
		"template": "./post.md",
		"filename": "{{slug}}"
	},
	"blocks": [
		{ "id": "title", "label": "Title", "type": "text", "show": "primary", "required": true },
		{ "id": "slug", "label": "Slug", "type": "text", "required": true },
		{ "id": "published", "label": "Published", "type": "boolean", "show": "secondary" },
		{
			"id": "tags",
			"label": "Tags",
			"type": "block",
			"collection": true,
			"blocks": [
				{ "id": "name", "label": "Name", "type": "text" }
			]
		}
	]
}`);

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
		expect(normalizeFields(config.blocks)).toMatchObject({
			title: { type: 'text', label: 'Title' },
			published: { type: 'boolean', label: 'Published', show: 'secondary' }
		});
	});

	it('derives card fields from show metadata', () => {
		expect(getCardFields(config)).toEqual({
			primary: [expect.objectContaining({ id: 'title', type: 'text' })],
			secondary: [expect.objectContaining({ id: 'published', type: 'boolean' })]
		});
	});
});
