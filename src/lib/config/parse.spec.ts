import { describe, expect, it } from 'vitest';
import { parseConfigFile, parseRootConfig } from '$lib/config/parse';

describe('parseConfigFile', () => {
	it('parses content configs in the new explicit schema', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Posts",
			"itemLabel": "Post",
			"collection": true,
			"idField": "slug",
			"content": {
				"mode": "directory",
				"path": "./src/content/posts",
				"template": "./templates/post.md",
				"filename": "{{slug}}"
			},
			"blocks": [
				{ "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
				{ "id": "slug", "type": "text", "label": "Slug", "required": true }
			]
		}`);

		expect(parsed.type).toBe('content');
		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}
		if (!('template' in parsed)) {
			throw new Error('Expected directory-backed content config');
		}

		expect(parsed.template).toBe('./templates/post.md');
		expect(parsed.filename).toBe('{{slug}}');
		expect(parsed.fields.title).toMatchObject({
			type: 'text',
			label: 'Title',
			required: true,
			show: 'primary'
		});
		expect(parsed.collection).toBe(true);
	});

	it('parses block configs in the new explicit schema', () => {
		const parsed = parseConfigFile(`{
			"type": "block",
			"id": "seo",
			"label": "SEO",
			"blocks": [
				{ "id": "metaTitle", "type": "text", "label": "Meta Title" }
			]
		}`);

		expect(parsed.type).toBe('block');
		if (parsed.type !== 'block') {
			throw new Error('Expected block config');
		}

		expect(parsed.fields.metaTitle).toMatchObject({
			type: 'text',
			label: 'Meta Title'
		});
	});

	it('rejects top-level content configs with embedded mode', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Site Settings",
				"content": { "mode": "embedded" },
				"blocks": [
					{ "id": "title", "type": "text" }
				]
			}`)
		).toThrow(/must be "file" or "directory"/);
	});
});

describe('parseRootConfig', () => {
	it('parses root discovery settings', () => {
		const parsed = parseRootConfig(`{
			"blocksDir": "./tentman/blocks",
			"configsDir": "./tentman/configs",
			"assetsDir": "./static/images"
		}`);

		expect(parsed).toEqual({
			blocksDir: './tentman/blocks',
			configsDir: './tentman/configs',
			assetsDir: './static/images'
		});
	});
});
