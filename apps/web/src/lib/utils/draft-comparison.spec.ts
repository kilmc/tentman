import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	isParsedContentConfig,
	parseConfigFile,
	type ParsedContentConfig
} from '$lib/config/parse';
import type { ContentRecord } from '$lib/features/content-management/types';

const contentServiceMocks = vi.hoisted(() => ({
	fetchContentDocument: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	fetchContentDocument: contentServiceMocks.fetchContentDocument
}));

import {
	clearDraftComparisonContextCache,
	compareDraftToBranch,
	compareLoadedDraftContent,
	getChangeCount,
	hasChanges
} from './draft-comparison';

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

function createOctokit(options?: {
	draftDate?: string;
	mainSha?: string;
	mergeBaseSha?: string;
	files?: Array<{ filename: string; status: string; previous_filename?: string }>;
}) {
	const draftDate = options?.draftDate ?? '2026-05-20T12:00:00.000Z';
	const mainSha = options?.mainSha ?? 'main-sha';
	const mergeBaseSha = options?.mergeBaseSha ?? mainSha;
	const files = options?.files ?? [];

	return {
		rest: {
			repos: {
				getBranch: vi.fn(async ({ branch }: { branch: string }) => {
					if (branch === 'tentman-preview') {
						return {
							data: {
								commit: {
									sha: 'draft-sha',
									commit: {
										committer: {
											date: draftDate
										}
									}
								}
							}
						};
					}

					if (branch === 'trunk') {
						return {
							data: {
								commit: {
									sha: mainSha,
									commit: {
										committer: {
											date: draftDate
										}
									}
								}
							}
						};
					}

					throw { status: 404 };
				}),
				compareCommits: vi.fn(async () => ({
					data: {
						merge_base_commit: {
							sha: mergeBaseSha
						},
						files
					}
				}))
			}
		}
	};
}

describe('utils/draft-comparison', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearDraftComparisonContextCache();
	});

	it('compares singleton documents as a single modified record', () => {
		const comparison = compareLoadedDraftContent(
			singletonConfig,
			{ title: 'Before' },
			{ title: 'After' }
		);

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

	it('skips full content reads when a singleton file path is unchanged', async () => {
		const octokit = createOctokit({
			files: [{ filename: 'content/posts/hello-world.md', status: 'modified' }]
		});

		const comparison = await compareDraftToBranch(
			octokit as never,
			'acme',
			'docs',
			'trunk',
			singletonConfig,
			'content/about.tentman.json',
			'tentman-preview'
		);

		expect(comparison).toMatchObject({
			modified: [],
			created: [],
			deleted: []
		});
		expect(contentServiceMocks.fetchContentDocument).not.toHaveBeenCalled();
	});

	it('skips full content reads when directory-backed changes can be derived from file paths', async () => {
		const octokit = createOctokit({
			files: [
				{ filename: 'content/posts/hello-world.md', status: 'modified' },
				{ filename: 'content/posts/new-post.md', status: 'added' },
				{ filename: 'content/posts/old-post.md', status: 'removed' }
			]
		});

		const comparison = await compareDraftToBranch(
			octokit as never,
			'acme',
			'docs',
			'trunk',
			directoryConfig,
			'content/posts.tentman.json',
			'tentman-preview'
		);

		expect(comparison.modified.map((change) => change.itemId)).toEqual(['hello-world']);
		expect(comparison.created.map((change) => change.itemId)).toEqual(['new-post']);
		expect(comparison.deleted.map((change) => change.itemId)).toEqual(['old-post']);
		expect(contentServiceMocks.fetchContentDocument).not.toHaveBeenCalled();
	});

	it('falls back to full content reads for changed file-backed collections', async () => {
		contentServiceMocks.fetchContentDocument
			.mockResolvedValueOnce([{ slug: 'first-post', title: 'First' }])
			.mockResolvedValueOnce([
				{ slug: 'first-post', title: 'Updated First' },
				{ slug: 'second-post', title: 'Second' }
			]);
		const octokit = createOctokit({
			files: [{ filename: 'content/posts.json', status: 'modified' }]
		});

		const comparison = await compareDraftToBranch(
			octokit as never,
			'acme',
			'docs',
			'trunk',
			arrayConfig,
			'content/posts.tentman.json',
			'tentman-preview'
		);

		expect(comparison.modified.map((change) => change.itemId)).toEqual(['first-post']);
		expect(comparison.created.map((change) => change.itemId)).toEqual(['second-post']);
		expect(contentServiceMocks.fetchContentDocument).toHaveBeenCalledTimes(2);
	});
});
