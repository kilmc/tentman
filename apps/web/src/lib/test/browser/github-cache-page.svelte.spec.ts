import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import type { GithubCacheInventorySummary } from '$lib/stores/github-repository-cache';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		}
	};
}

const cachePageMocks = vi.hoisted(() => {
	const inventory = createStoreState<GithubCacheInventorySummary>({
		workspaceKey: 'acme/docs:main:head-main:tree-main',
		repoFullName: 'acme/docs',
		activeRef: 'main',
		activeHeadSha: 'head-main',
		activeTreeSha: 'tree-main',
		lastCheckedAt: Date.UTC(2026, 5, 10, 8, 30),
		totalTargets: 4,
		cachedTargets: 2,
		staleTargets: 1,
		missingTargets: 0,
		refreshingTargets: 0,
		errorTargets: 0,
		skippedBudgetTargets: 1,
		storageBytes: 1536,
		documentBudgetBytes: 50 * 1024 * 1024,
		documentRecordLimit: 2500,
		documentRecords: 1,
		budgetLimited: true,
		records: [
			{
				key: 'workspace:snapshot',
				targetId: 'snapshot',
				targetType: 'snapshot',
				repoFullName: 'acme/docs',
				workspaceKey: 'acme/docs:main:head-main:tree-main',
				activeRef: 'main',
				mainHeadSha: 'head-main',
				mainTreeSha: 'tree-main',
				draftHeadSha: null,
				draftTreeSha: null,
				path: null,
				label: 'Repository snapshot',
				configSlug: null,
				itemId: null,
				blobSha: null,
				schemaIdentity: null,
				dependencyIdentity: 'tree-main',
				status: 'fresh',
				lastCachedAt: Date.UTC(2026, 5, 10, 8, 20),
				lastCheckedAt: Date.UTC(2026, 5, 10, 8, 30),
				estimatedBytes: 512,
				error: null
			},
			{
				key: 'workspace:collectionIndex:posts',
				targetId: 'collectionIndex:posts',
				targetType: 'collectionIndex',
				repoFullName: 'acme/docs',
				workspaceKey: 'acme/docs:main:head-main:tree-main',
				activeRef: 'main',
				mainHeadSha: 'head-main',
				mainTreeSha: 'tree-main',
				draftHeadSha: null,
				draftTreeSha: null,
				path: 'tentman/configs/posts.tentman.json',
				label: 'Posts',
				configSlug: 'posts',
				itemId: null,
				blobSha: null,
				schemaIdentity: 'schema-posts',
				dependencyIdentity: 'src/content/posts',
				status: 'stale',
				lastCachedAt: Date.UTC(2026, 5, 10, 8, 21),
				lastCheckedAt: Date.UTC(2026, 5, 10, 8, 30),
				estimatedBytes: 1024,
				error: null
			},
			{
				key: 'workspace:itemDocument:posts:hello-world',
				targetId: 'itemDocument:posts:hello-world',
				targetType: 'itemDocument',
				repoFullName: 'acme/docs',
				workspaceKey: 'acme/docs:main:head-main:tree-main',
				activeRef: 'main',
				mainHeadSha: 'head-main',
				mainTreeSha: 'tree-main',
				draftHeadSha: null,
				draftTreeSha: null,
				path: 'src/content/posts/hello-world.md',
				label: 'Hello world',
				configSlug: 'posts',
				itemId: 'hello-world',
				blobSha: 'blob-hello-world',
				schemaIdentity: 'schema-posts',
				dependencyIdentity: 'tree-main',
				status: 'fresh',
				lastCachedAt: Date.UTC(2026, 5, 10, 8, 22),
				lastCheckedAt: Date.UTC(2026, 5, 10, 8, 30),
				estimatedBytes: null,
				error: null
			},
			{
				key: 'workspace:itemDocument:posts:archive',
				targetId: 'itemDocument:posts:archive',
				targetType: 'itemDocument',
				repoFullName: 'acme/docs',
				workspaceKey: 'acme/docs:main:head-main:tree-main',
				activeRef: 'main',
				mainHeadSha: 'head-main',
				mainTreeSha: 'tree-main',
				draftHeadSha: null,
				draftTreeSha: null,
				path: 'src/content/posts/archive.md',
				label: 'Archive',
				configSlug: 'posts',
				itemId: 'archive',
				blobSha: 'blob-archive',
				schemaIdentity: 'schema-posts',
				dependencyIdentity: 'tree-main',
				status: 'skipped-budget',
				lastCachedAt: null,
				lastCheckedAt: Date.UTC(2026, 5, 10, 8, 30),
				estimatedBytes: null,
				error: null
			}
		]
	});

	return {
		inventory,
		refreshInventory: vi.fn(async () => {}),
		refreshInventoryTarget: vi.fn(async () => {}),
		clearRepoRef: vi.fn(async () => {})
	};
});

vi.mock('$lib/stores/github-repository-cache', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/github-repository-cache')>();
	return {
		...actual,
		githubCacheInventoryStatus: cachePageMocks.inventory,
		githubRepositoryCache: {
			refreshInventory: cachePageMocks.refreshInventory,
			refreshInventoryTarget: cachePageMocks.refreshInventoryTarget,
			clearRepoRef: cachePageMocks.clearRepoRef
		}
	};
});

import CachePage from '../../../routes/pages/cache/+page.svelte';

describe('routes/pages/cache/+page.svelte', () => {
	beforeEach(() => {
		cachePageMocks.refreshInventory.mockClear();
		cachePageMocks.refreshInventoryTarget.mockClear();
		cachePageMocks.clearRepoRef.mockClear();
	});

	it('renders durable inventory rows and counts skipped budget rows as completed progress', async () => {
		const screen = await render(CachePage);

		await expectElement(screen.getByRole('heading', { name: 'Cache inventory' })).toBeVisible();
		await expectElement(screen.getByText('acme/docs')).toBeVisible();
		await expectElement(screen.getByRole('cell', { name: 'Posts', exact: true })).toBeVisible();
		await expectElement(screen.getByText('Hello world')).toBeVisible();
		await expectElement(screen.getByText('Budget limited')).toBeVisible();
		expect(screen.container.querySelector('.bg-stone-950')?.getAttribute('style')).toBe(
			'width: 75%;'
		);
	});

	it('wires inventory management actions to the cache store', async () => {
		const screen = await render(CachePage);

		await screen.getByRole('button', { name: 'Refresh stale' }).click();
		expect(cachePageMocks.refreshInventory).toHaveBeenCalledWith({
			fetcher: expect.any(Function),
			scope: 'stale'
		});

		await screen.getByRole('button', { name: 'Refresh all' }).click();
		expect(cachePageMocks.refreshInventory).toHaveBeenCalledWith({
			fetcher: expect.any(Function),
			scope: 'all'
		});

		await screen.getByRole('button', { name: 'Refresh Posts' }).click();
		expect(cachePageMocks.refreshInventoryTarget).toHaveBeenCalledWith({
			targetId: 'collectionIndex:posts',
			fetcher: expect.any(Function)
		});

		await screen.getByRole('button', { name: 'Clear cache' }).click();
		expect(cachePageMocks.clearRepoRef).toHaveBeenCalledWith({
			repoFullName: 'acme/docs',
			ref: 'main'
		});
	});
});
