import { beforeEach, describe, expect, it } from 'vitest';
import {
	assertWorkflowRequestBudgetForTests,
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests,
	markWorkflowReadiness,
	recordCacheWork,
	traceBrowserRequest,
	traceGitHubRequest
} from './workflow-instrumentation';

describe('workflow instrumentation', () => {
	beforeEach(() => {
		clearWorkflowInstrumentationEventsForTests();
	});

	it('records readiness marks and browser request traces for budget assertions', async () => {
		markWorkflowReadiness({
			workflow: 'desktop-collection-landing',
			mark: 'collection-landing-ready',
			route: '/pages/posts',
			slug: 'posts'
		});

		await traceBrowserRequest(
			{
				workflow: 'desktop-collection-landing',
				route: '/pages/posts',
				endpoint: '/api/repo/collection-index?slug=posts',
				priority: 'foreground',
				cacheTaskKey: 'collectionIndex:posts',
				duplicateState: 'deduped'
			},
			async () => new Response('{}', { status: 200 })
		);

		expect(getWorkflowInstrumentationEventsForTests()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'workflow-readiness',
					workflow: 'desktop-collection-landing',
					mark: 'collection-landing-ready',
					route: '/pages/posts',
					slug: 'posts'
				}),
				expect.objectContaining({
					kind: 'browser-request',
					workflow: 'desktop-collection-landing',
					route: '/pages/posts',
					priority: 'foreground',
					cacheTaskKey: 'collectionIndex:posts',
					duplicateState: 'deduped',
					responseStatus: 200,
					resultStatus: 'ok'
				})
			])
		);
		expect(() =>
			assertWorkflowRequestBudgetForTests({
				workflow: 'desktop-collection-landing',
				route: '/pages/posts',
				maxBrowserRequests: 1,
				maxRouteDataFallbacks: 0,
				maxRequests: 1
			})
		).not.toThrow();
	});

	it('records GitHub response status, rate-limit headers, retry-after, and cache context', async () => {
		await traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'readGitHubTextBlob',
				requestKind: 'blob',
				repoKey: 'github:acme/docs',
				owner: 'acme',
				repo: 'docs',
				sha: 'blob-1',
				cacheResult: 'miss',
				dedupeState: 'unique'
			},
			async () => ({
				status: 200,
				headers: {
					'x-ratelimit-limit': '5000',
					'x-ratelimit-remaining': '4999',
					'x-ratelimit-reset': '123',
					'x-ratelimit-used': '1',
					'x-ratelimit-resource': 'core',
					'retry-after': '2'
				},
				data: {}
			})
		);

		expect(getWorkflowInstrumentationEventsForTests()).toEqual([
			expect.objectContaining({
				kind: 'github-request',
				source: 'repository-data',
				operation: 'readGitHubTextBlob',
				requestKind: 'blob',
				responseStatus: 200,
				resultStatus: 'ok',
				cacheResult: 'miss',
				dedupeState: 'unique',
				retryAfter: '2',
				rateLimit: {
					limit: '5000',
					remaining: '4999',
					reset: '123',
					used: '1',
					resource: 'core'
				}
			})
		]);
	});

	it('records cache work state for stalled-looking progress diagnosis', () => {
		recordCacheWork({
			phase: 'running',
			operation: 'projection-hydration',
			workflow: 'desktop-collection-landing',
			route: '/pages/projects',
			repoFullName: 'kilmc/theresagrieben',
			ref: 'tentman-preview',
			taskKey: 'collectionProjection:projects:blob-31',
			taskKind: 'collectionProjectionBatch',
			priority: 'topLevel',
			progressCompleted: 31,
			progressTotal: 116,
			queuedTasks: 4,
			runningTasks: 1,
			reason: 'hydrating remaining collection projections'
		});

		expect(getWorkflowInstrumentationEventsForTests()).toEqual([
			expect.objectContaining({
				kind: 'cache-work',
				phase: 'running',
				operation: 'projection-hydration',
				workflow: 'desktop-collection-landing',
				route: '/pages/projects',
				repoFullName: 'kilmc/theresagrieben',
				ref: 'tentman-preview',
				taskKey: 'collectionProjection:projects:blob-31',
				taskKind: 'collectionProjectionBatch',
				priority: 'topLevel',
				progressCompleted: 31,
				progressTotal: 116,
				queuedTasks: 4,
				runningTasks: 1,
				reason: 'hydrating remaining collection projections'
			})
		]);
	});

	it('scopes request budget assertions to matching routes', async () => {
		await traceBrowserRequest(
			{
				workflow: 'item-route-shell',
				route: '/pages/posts/hello',
				endpoint: '/api/repo/item-view?slug=posts&itemId=hello',
				priority: 'foreground',
				cacheTaskKey: null,
				duplicateState: 'unique'
			},
			async () => new Response('{}', { status: 200 })
		);
		await traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'readGitHubTextBlob',
				requestKind: 'blob',
				repoKey: 'github:acme/docs',
				owner: 'acme',
				repo: 'docs',
				sha: 'blob-1'
			},
			async () => ({
				status: 200,
				headers: {},
				data: {}
			})
		);

		expect(() =>
			assertWorkflowRequestBudgetForTests({
				route: '/pages/posts/hello',
				maxBrowserRequests: 1,
				maxGitHubRequests: 0,
				maxRouteDataFallbacks: 0,
				maxRequests: 1
			})
		).not.toThrow();
	});
});
