import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import type {
	GithubCacheInventorySummary,
	GithubCacheWorkObservabilityStatus
} from '$lib/stores/github-repository-cache';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		}
	};
}

const cachePageMocks = vi.hoisted(() => {
	const createEmptyWorkObservability = (): GithubCacheWorkObservabilityStatus => ({
		current: {
			state: 'idle',
			operation: 'no-active-work',
			taskKey: null,
			taskKind: null,
			label: 'No cache work is running',
			route: null,
			reason: null,
			startedAt: null,
			updatedAt: Date.UTC(2026, 5, 10, 8, 30),
			progressCompleted: 3,
			progressTotal: 4,
			queuedTasks: 0,
			runningTasks: 0
		},
		recent: [],
		progressExplanation:
			'3 of 4 cache targets are complete. The total can grow after Tentman discovers collection items.'
	});
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
	const workObservability =
		createStoreState<GithubCacheWorkObservabilityStatus>(createEmptyWorkObservability());

	return {
		inventory,
		workObservability,
		createEmptyWorkObservability,
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
		githubCacheWorkObservabilityStatus: cachePageMocks.workObservability,
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
		cachePageMocks.workObservability.set(cachePageMocks.createEmptyWorkObservability());
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
		await expectElement(
			screen.getByText(
				'3 of 4 cache targets are complete. The total can grow after Tentman discovers collection items.'
			)
		).toBeVisible();
	});

	it.each([
		{
			state: 'running' as const,
			heading: 'Running',
			operation: 'Projection hydration'
		},
		{
			state: 'paused' as const,
			heading: 'Paused',
			operation: 'Queue wait'
		},
		{
			state: 'backing-off' as const,
			heading: 'Backing off',
			operation: 'Retry/backoff'
		},
		{
			state: 'rate-limited' as const,
			heading: 'Rate limited',
			operation: 'Rate-limit pause'
		},
		{
			state: 'completed' as const,
			heading: 'Completed',
			operation: 'Full-document warming'
		}
	])('renders the current cache work state: $heading', async ({ state, heading, operation }) => {
		cachePageMocks.workObservability.set({
			current: {
				state,
				operation:
					state === 'running'
						? 'projection-hydration'
						: state === 'completed'
							? 'full-document-warming'
							: state === 'rate-limited'
								? 'rate-limit-pause'
								: state === 'backing-off'
									? 'retry-backoff'
									: 'queue-wait',
				taskKey: 'collectionProjection:posts:hello-world',
				taskKind: 'collectionProjectionBatch',
				label: 'Posts / Hello world',
				route: '/pages/posts',
				reason: state === 'backing-off' ? 'GitHub rate limit reached; retrying cache work' : null,
				startedAt: Date.UTC(2026, 5, 10, 8, 29),
				updatedAt: Date.UTC(2026, 5, 10, 8, 30),
				progressCompleted: 2,
				progressTotal: 5,
				queuedTasks: 2,
				runningTasks: state === 'running' ? 1 : 0
			},
			recent: [
				{
					id: 'recent:1',
					label: 'Slow failed document',
					operation: 'item-document-warming',
					taskKey: 'itemDocument:posts:archive',
					taskKind: 'itemDocument',
					route: '/pages/posts/archive',
					result: 'error',
					reason: 'item document request failed (502)',
					durationMs: 1420,
					finishedAt: Date.UTC(2026, 5, 10, 8, 28)
				}
			],
			progressExplanation:
				'2 of 5 cache targets are complete. The total can grow after Tentman discovers collection items.'
		});

		const screen = await render(CachePage);

		await expectElement(screen.getByText(heading)).toBeVisible();
		await expectElement(screen.getByText(operation)).toBeVisible();
		await expectElement(screen.getByText('Posts / Hello world')).toBeVisible();
		await expectElement(screen.getByText('2 queued')).toBeVisible();
		await expectElement(screen.getByText('Slow failed document')).toBeVisible();
		await expectElement(screen.getByText('1.4s')).toBeVisible();
		await expectElement(screen.getByText('item document request failed (502)')).toBeVisible();
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
