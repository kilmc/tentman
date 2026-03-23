import { describe, expect, it } from 'vitest';
import {
	isParsedContentConfig,
	parseConfigFile,
	type ParsedContentConfig
} from '$lib/config/parse';
import { validateFormData } from './validation';

function parseContentConfigFixture(content: string): ParsedContentConfig {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error('Expected content config fixture');
	}

	return parsed;
}

describe('utils/validation', () => {
	it('validates unresolved collection blocks as arrays using block labels', () => {
		const config = parseContentConfigFixture(`{
			"type": "content",
			"label": "Pages",
			"content": {
				"mode": "file",
				"path": "./pages.json"
			},
			"blocks": [
				{
					"id": "gallery",
					"type": "galleryBlock",
					"label": "Gallery",
					"collection": true
				}
			]
		}`);

		expect(validateFormData(config, { gallery: 'not-an-array' })).toEqual([
			{
				field: 'gallery',
				message: 'Gallery must be an array'
			}
		]);
	});

	it('uses block metadata for duplicate id-field messages', () => {
		const config = parseContentConfigFixture(`{
			"type": "content",
			"label": "Posts",
			"itemLabel": "Post",
			"collection": true,
			"idField": "slug",
			"content": {
				"mode": "directory",
				"path": "./posts",
				"template": "./post.md"
			},
			"blocks": [
				{ "id": "slug", "type": "text", "label": "Slug", "required": true },
				{ "id": "title", "type": "text", "label": "Title" }
			]
		}`);

		expect(
			validateFormData(
				config,
				{ slug: 'hello-world', title: 'Hello' },
				{ existingItems: [{ slug: 'hello-world' }] }
			)
		).toEqual([
			{
				field: 'slug',
				message: 'Slug must be unique. This value is already in use.'
			}
		]);
	});
});
