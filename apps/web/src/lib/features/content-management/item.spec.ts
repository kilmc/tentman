import { describe, expect, it } from 'vitest';
import { findContentItemByRoute, formatContentValue, getItemId, getItemRoute } from './item';
import {
	isParsedContentConfig,
	parseConfigFile,
	type ParsedContentConfig
} from '$lib/config/parse';

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
	"collection": { "sorting": "manual" },
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
	"collection": { "sorting": "manual" },
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
		expect(getItemId({ _tentmanId: 'post-1', slug: 'hello-world' })).toBe('post-1');
		expect(getItemRoute(arrayConfig, { _tentmanId: 'post-1', slug: 'hello-world' })).toBe(
			'hello-world'
		);
	});

	it('falls back to the Tentman id for routes when no slug field is available', () => {
		expect(getItemRoute(collectionConfig, { _tentmanId: 'post-2' })).toBe('post-2');
	});

	it('finds items by stable Tentman id as well as route slug', () => {
		const item = { _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello World' };
		const items = [item];

		expect(findContentItemByRoute(items, collectionConfig, 'hello-world')).toBe(item);
		expect(findContentItemByRoute(items, collectionConfig, 'post-1')).toBe(item);
	});

	it('formats display values consistently', () => {
		expect(formatContentValue(true)).toBe('Yes');
		expect(formatContentValue(['a', 'b'])).toBe('[2 items]');
		expect(formatContentValue('2026-03-18')).toContain('2026');
	});
});
