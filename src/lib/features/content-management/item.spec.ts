import { describe, expect, it } from 'vitest';
import { formatContentValue, getContentItemId } from './item';
import { isParsedContentConfig, parseConfigFile, type ParsedContentConfig } from '$lib/config/parse';

function parseContentConfigFixture(content: string): ParsedContentConfig {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error('Expected content config fixture');
	}

	return parsed;
}

const arrayConfig = parseContentConfigFixture(`{
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
}`);

const collectionConfig = parseContentConfigFixture(`{
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
}`);

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
