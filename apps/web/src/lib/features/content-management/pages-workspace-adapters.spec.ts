import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';
import {
	createPagesWorkspaceAdapter,
	shouldInvalidatePagesWorkspaceData,
	type PagesWorkspaceAdapterContext
} from './pages-workspace-adapters';

const githubRepositoryCacheMock = vi.hoisted(() => ({
	hydrateFromBootstrap: vi.fn(),
	startFreshnessScheduler: vi.fn(() => vi.fn()),
	clearRepoRef: vi.fn(),
	resetFreshnessSchedule: vi.fn(),
	getCollectionNavigation: vi.fn(),
	warmCollection: vi.fn(),
	invalidatePaths: vi.fn(),
	promoteRoute: vi.fn(),
	onCollectionChange: vi.fn()
}));

const draftBranchMock = vi.hoisted(() => ({
	setBranch: vi.fn(),
	hasDraft: vi.fn(() => false),
	clear: vi.fn()
}));

vi.mock('$lib/stores/github-repository-cache', () => ({
	githubRepositoryCache: githubRepositoryCacheMock
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: draftBranchMock
}));

function createGitHubContext(fetcher: typeof fetch): PagesWorkspaceAdapterContext {
	return {
		mode: 'github',
		fetcher,
		selectedRepo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		},
		repositoryIdentity: {
			ref: 'main'
		},
		activeDraftBranch: null,
		bootstrap: EMPTY_REPO_CONFIGS_BOOTSTRAP,
		getConfigs: () => [],
		getNavigationManifest: () => null,
		getRootConfig: () => null,
		getCurrentConfig: () => null,
		getRoutePath: () => '/pages',
		redirectToExpiredSession: vi.fn(),
		switchToRepos: vi.fn(),
		resolveEndpoint: (path) => `/base${path}`
	};
}

describe('pages workspace adapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps GitHub page data invalidation behind the adapter predicate', () => {
		expect(
			shouldInvalidatePagesWorkspaceData(new URL('https://tentman.test/api/repo/config-states'))
		).toBe(true);
		expect(shouldInvalidatePagesWorkspaceData(new URL('https://tentman.test/api/repo/blob'))).toBe(
			false
		);
	});

	it('saves GitHub navigation as an adapter result and invalidates manifest cache', async () => {
		const fetcher = vi.fn(async () => {
			return new Response(JSON.stringify({ branchName: 'tentman-draft' }), { status: 200 });
		}) as unknown as typeof fetch;
		const adapter = createPagesWorkspaceAdapter(createGitHubContext(fetcher));

		const result = await adapter.saveNavigation({
			manifest: {
				version: 1,
				content: {
					items: []
				}
			}
		});

		expect(result).toMatchObject({
			type: 'navigation-saved',
			message: 'Navigation saved.',
			branchName: 'tentman-draft',
			invalidateWorkspace: true
		});
		expect(fetcher).toHaveBeenCalledWith(
			'/base/api/repo/navigation-manifest',
			expect.objectContaining({
				method: 'POST'
			})
		);
		expect(githubRepositoryCacheMock.invalidatePaths).toHaveBeenCalledWith([
			'tentman/navigation-manifest.json'
		]);
		expect(draftBranchMock.setBranch).toHaveBeenCalledWith('tentman-draft', 'acme/docs');
	});
});
