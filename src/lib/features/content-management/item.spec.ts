import { describe, expect, it } from 'vitest';
import { formatContentValue, getContentItemId } from './item';
import { parseConfigFile } from '$lib/config/parse';
import type { Config } from '$lib/types/config';

const arrayConfig = parseConfigFile(`{
	"type": "content",
	"label": "Posts",
	"itemLabel": "Post",
	"collection": true,
	"idField": "slug",
	"content": {
		"mode": "file",
		"path": "./posts.json",
		"itemsPath": "$.posts"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title" },
		{ "id": "slug", "type": "text", "label": "Slug" }
	]
}`) as Config;

const collectionConfig = parseConfigFile(`{
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
		{ "id": "title", "type": "text", "label": "Title" },
		{ "id": "slug", "type": "text", "label": "Slug" }
	]
}`) as Config;

describe('content-management/item', () => {
	it('resolves item ids for array content', () => {
		expect(getContentItemId(arrayConfig, { slug: 'hello-world' })).toBe('hello-world');
	});

	it('resolves item ids for collection content from filenames', () => {
		expect(getContentItemId(collectionConfig, { _filename: 'hello-world.md' })).toBe('hello-world');
	});

	it('formats display values consistently', () => {
		expect(formatContentValue(true)).toBe('Yes');
		expect(formatContentValue(['a', 'b'])).toBe('[2 items]');
		expect(formatContentValue('2026-03-18')).toContain('2026');
	});
});
