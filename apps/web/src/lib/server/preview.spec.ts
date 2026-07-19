import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/repository-data', () => ({
	resolveCollectionItemDocument: vi.fn(async () => null)
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

import {
	getExistingItemMutationOptions,
	resolveExistingCollectionItemDeleteOptions,
	resolveExistingItemMutationOptions
} from './preview';
import { resolveCollectionItemDocument } from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';
import {
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';

const directoryConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		label: 'Posts',
		collection: true,
		content: {
			mode: 'directory'
		},
		blocks: []
	}
} as const;

const fileConfig = {
	...directoryConfig,
	config: {
		...directoryConfig.config,
		content: {
			mode: 'file'
		}
	}
} as const;

const backend = {
	kind: 'github',
	cacheKey: 'github:acme/docs',
	label: 'acme/docs'
} as never;

describe('preview mutation helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue(null);
		clearWorkflowInstrumentationEventsForTests();
	});

	it('keeps existing item save options mode-specific', () => {
		expect(getExistingItemMutationOptions('file', 'hello-world')).toEqual({
			itemId: 'hello-world'
		});
		expect(getExistingItemMutationOptions('directory', 'hello-world')).toBeNull();
		expect(getExistingItemMutationOptions('directory', 'hello-world', 'hello-world.md')).toEqual({
			filename: 'hello-world.md'
		});
		expect(
			getExistingItemMutationOptions(
				'directory',
				'hello-world',
				'hello-world.md',
				'updated-world.md'
			)
		).toEqual({
			filename: 'hello-world.md',
			newFilename: 'updated-world.md'
		});
	});

	it('deletes file-backed collection items by item id', async () => {
		await expect(
			resolveExistingCollectionItemDeleteOptions({
				backend,
				discoveredConfig: fileConfig as never,
				itemId: 'hello-world',
				branch: 'tentman-preview'
			})
		).resolves.toEqual({
			branch: 'tentman-preview',
			itemId: 'hello-world'
		});

		expect(resolveCollectionItemDocument).not.toHaveBeenCalled();
		expect(getCachedContent).not.toHaveBeenCalled();
	});

	it('resolves existing directory mutation options from repository-data when filename is missing', async () => {
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue({
			config: directoryConfig,
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'blob-hello-world',
				title: 'Hello world',
				sortDate: null
			},
			content: {
				title: 'Hello world'
			}
		} as never);

		await expect(
			resolveExistingItemMutationOptions({
				backend,
				discoveredConfig: directoryConfig as never,
				itemId: 'hello-world',
				newFilename: 'updated-world.md',
				ref: 'tentman-preview'
			})
		).resolves.toEqual({
			filename: 'hello-world.md',
			newFilename: 'updated-world.md'
		});

		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend,
			slug: 'posts',
			itemId: 'hello-world',
			ref: 'tentman-preview'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(
			getWorkflowInstrumentationEventsForTests().filter(
				(event) => event.kind === 'route-data-fallback'
			)
		).toEqual([]);
	});

	it('falls back to legacy content cache for existing directory mutation options', async () => {
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		await expect(
			resolveExistingItemMutationOptions({
				backend,
				discoveredConfig: directoryConfig as never,
				itemId: 'hello-world'
			})
		).resolves.toEqual({
			filename: 'hello-world.md'
		});

		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			directoryConfig.config,
			directoryConfig.path,
			directoryConfig.slug,
			undefined
		);
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'route-data-fallback',
					route: '/pages/posts/hello-world/preview-changes',
					slug: 'posts',
					itemId: 'hello-world',
					source: 'preview-filename',
					reason: 'directory item filename repository-data unavailable'
				})
			])
		);
	});

	it('prefers repository-data filenames for directory-backed collection deletes', async () => {
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue({
			config: directoryConfig,
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'blob-hello-world',
				title: 'Hello world',
				sortDate: null
			},
			content: {
				_filename: 'legacy-name-should-not-be-used.md',
				title: 'Hello world'
			}
		} as never);

		await expect(
			resolveExistingCollectionItemDeleteOptions({
				backend,
				discoveredConfig: directoryConfig as never,
				itemId: 'hello-world',
				branch: 'tentman-preview'
			})
		).resolves.toEqual({
			branch: 'tentman-preview',
			filename: 'hello-world.md'
		});

		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend,
			slug: 'posts',
			itemId: 'hello-world',
			ref: 'tentman-preview'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(
			getWorkflowInstrumentationEventsForTests().filter(
				(event) => event.kind === 'route-data-fallback'
			)
		).toEqual([]);
	});

	it('falls back to legacy content cache filenames for incomplete directory resolvers', async () => {
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		await expect(
			resolveExistingCollectionItemDeleteOptions({
				backend,
				discoveredConfig: directoryConfig as never,
				itemId: 'hello-world',
				branch: 'tentman-preview'
			})
		).resolves.toEqual({
			branch: 'tentman-preview',
			filename: 'hello-world.md'
		});

		expect(getCachedContent).toHaveBeenCalledWith(
			backend,
			directoryConfig.config,
			directoryConfig.path,
			directoryConfig.slug,
			'tentman-preview'
		);
		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'route-data-fallback',
					route: '/pages/posts/hello-world/preview-changes',
					slug: 'posts',
					itemId: 'hello-world',
					source: 'preview-filename',
					reason: 'directory item filename repository-data unavailable'
				})
			])
		);
	});
});
