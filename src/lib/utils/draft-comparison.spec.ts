import { describe, expect, it } from 'vitest';
import { isParsedContentConfig, parseConfigFile, type ParsedContentConfig } from '$lib/config/parse';
import type { ContentRecord } from '$lib/features/content-management/types';
import { compareLoadedDraftContent, getChangeCount, hasChanges } from './draft-comparison';

function parseContentConfigFixture(content: string): ParsedContentConfig {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error('Expected content config fixture');
	}

	return parsed;
}

const singletonConfig = parseContentConfigFixture(`{
	"type": "content",
	"label": "Site Settings",
	"content": {
		"mode": "file",
		"path": "./site.json"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title" }
	]
}`);

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

const directoryConfig = parseContentConfigFixture(`{
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

describe('utils/draft-comparison', () => {
	it('compares singleton documents as a single modified record', () => {
		const comparison = compareLoadedDraftContent(singletonConfig, { title: 'Before' }, { title: 'After' });

		expect(comparison.modified).toHaveLength(1);
		expect(comparison.modified[0]?.itemId).toBe('_singleton');
		expect(hasChanges(comparison)).toBe(true);
		expect(getChangeCount(comparison)).toBe(1);
	});

	it('compares file-backed collections by configured item id', () => {
		const mainContent: ContentRecord[] = [
			{ slug: 'first-post', title: 'First' },
			{ slug: 'second-post', title: 'Second' }
		];
		const draftContent: ContentRecord[] = [
			{ slug: 'first-post', title: 'Updated First' },
			{ slug: 'third-post', title: 'Third' }
		];

		const comparison = compareLoadedDraftContent(arrayConfig, mainContent, draftContent);

		expect(comparison.modified.map((change) => change.itemId)).toEqual(['first-post']);
		expect(comparison.created.map((change) => change.itemId)).toEqual(['third-post']);
		expect(comparison.deleted.map((change) => change.itemId)).toEqual(['second-post']);
	});

	it('compares directory-backed collections by derived item ids', () => {
		const mainContent: ContentRecord[] = [
			{ slug: 'hello-world', title: 'Hello', _filename: 'hello-world.md' }
		];
		const draftContent: ContentRecord[] = [
			{ slug: 'hello-world', title: 'Updated Hello', _filename: 'hello-world.md' },
			{ slug: 'new-post', title: 'New', _filename: 'new-post.md' }
		];

		const comparison = compareLoadedDraftContent(directoryConfig, mainContent, draftContent);

		expect(comparison.modified.map((change) => change.itemId)).toEqual(['hello-world']);
		expect(comparison.created.map((change) => change.itemId)).toEqual(['new-post']);
		expect(comparison.deleted).toEqual([]);
	});
});
