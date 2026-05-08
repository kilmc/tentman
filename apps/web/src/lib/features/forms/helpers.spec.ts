import { describe, expect, it } from 'vitest';
import {
	isParsedContentConfig,
	parseConfigFile,
	type ParsedContentConfig
} from '$lib/config/parse';
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
	"editorLayout": {
		"aside": ["published", "slug"],
		"asideLabel": "Metadata"
	},
	"blocks": [
		{ "id": "title", "label": "Title", "type": "text", "required": true },
		{ "id": "slug", "label": "Slug", "type": "text", "required": true },
		{ "id": "published", "label": "Published", "type": "toggle" },
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

	it('preserves metadata fields alongside block-backed values', () => {
		expect(
			buildFormData(config, {
				title: 'Hello',
				_tentmanId: 'hello-world',
				_filename: 'hello-world.md'
			})
		).toEqual({
			title: 'Hello',
			slug: '',
			published: false,
			tags: [],
			_tentmanId: 'hello-world',
			_filename: 'hello-world.md'
		});
	});

	it('normalizes array-based field configs', () => {
		expect(normalizeFields(config.blocks)).toMatchObject({
			title: { type: 'text', label: 'Title' },
			published: { type: 'toggle', label: 'Published' }
		});
	});

	it('derives card fields from editorLayout metadata', () => {
		expect(getCardFields(config).primary).toEqual([
			expect.objectContaining({ id: 'title', type: 'text' }),
			expect.objectContaining({ id: 'tags', type: 'block' })
		]);
		expect(getCardFields(config).secondary).toEqual([
			expect.objectContaining({ id: 'published', type: 'toggle' }),
			expect.objectContaining({ id: 'slug', type: 'text' })
		]);
	});
});
