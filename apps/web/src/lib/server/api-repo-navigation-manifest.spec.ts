import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn(),
	invalidateCache: vi.fn()
}));

vi.mock('$lib/server/auth/github', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth/github')>('$lib/server/auth/github');

	return {
		...actual,
		createGitHubServerClient: vi.fn(() => ({ rest: {} }))
	};
});

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	reconcileManualNavigationSetup: vi.fn(async () => ({
		version: 1,
		content: {
			items: ['about', 'posts']
		}
	})),
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: true,
		manifest: {
			version: 1,
			content: {
				items: ['about', 'posts']
			}
		},
		error: null
	})),
	invalidateNavigationManifestStateCache: vi.fn(),
	parseNavigationManifest: vi.fn((value: string) => JSON.parse(value)),
	saveCollectionOrder: vi.fn(async () => ({
		version: 1,
		collections: {
			projects: {
				items: ['brand-system'],
				groups: [{ id: 'identity', label: 'Identity', items: ['brand-system'] }]
			}
		}
	})),
	writeRootManualSorting: vi.fn(async () => {}),
	writeMissingContentConfigIds: vi.fn(async () => []),
	writeNavigationManifest: vi.fn(async () => {})
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn(() => ({
		kind: 'github',
		cacheKey: 'github:acme/docs',
		label: 'acme/docs',
		supportsDraftBranches: true,
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async () =>
			JSON.stringify({
				type: 'content',
				label: 'Projects',
				collection: {
					sorting: 'manual'
				},
				content: {
					mode: 'directory',
					path: './projects',
					template: './project.md'
				},
				blocks: []
			})
		),
		writeTextFile: vi.fn(async () => {})
	})),
	invalidateGitHubRepositoryMetadataCache: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	ensureDraftBranch: vi.fn(async () => ({
		branchName: 'tentman-preview',
		created: false
	})),
	getTentmanDraftBranchName: vi.fn(async () => 'tentman-preview')
}));

vi.mock('$lib/github/pull-request', () => ({
	ensureDraftPullRequest: vi.fn(async () => ({
		number: 42,
		url: 'https://github.com/acme/docs/pull/42',
		title: 'Tentman draft changes'
	}))
}));

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn()
}));

import { POST } from '../../routes/api/repo/navigation-manifest/+server';
import { getCachedConfigs, invalidateCache } from '$lib/stores/config-cache';
import { invalidateRepositoryData } from '$lib/server/repository-data';
import {
	loadNavigationManifestState,
	reconcileManualNavigationSetup,
	saveCollectionOrder,
	writeMissingContentConfigIds,
	writeNavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

describe('POST /api/repo/navigation-manifest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('enables manual navigation by adding ids and writing a generated manifest', async () => {
		vi.mocked(getCachedConfigs)
			.mockResolvedValueOnce([
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						label: 'About',
						content: {
							mode: 'file'
						},
						blocks: []
					}
				}
			] as never)
			.mockResolvedValueOnce([
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						id: 'about',
						label: 'About',
						content: {
							mode: 'file'
						},
						blocks: []
					}
				}
			] as never);

		const response = await POST({
			request: new Request('http://localhost/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'enable'
				})
			}),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk'
				}
			},
			cookies: createCookies()
		} as never);

		expect(writeMissingContentConfigIds).toHaveBeenCalled();
		expect(ensureDraftBranch).toHaveBeenCalledWith(expect.anything(), 'acme', 'docs', 'trunk');
		expect(ensureDraftPullRequest).toHaveBeenCalledWith(
			expect.anything(),
			'acme',
			'docs',
			'tentman-preview',
			'trunk'
		);
		expect(reconcileManualNavigationSetup).toHaveBeenCalled();
		expect(writeNavigationManifest).toHaveBeenCalled();
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: 'tentman-preview',
			changedPaths: ['tentman/navigation-manifest.json'],
			reason: 'navigation-manifest'
		});
		expect(await response.json()).toEqual({
			navigationManifest: await loadNavigationManifestState({} as never, {
				ref: 'tentman-preview'
			}),
			branchName: 'tentman-preview'
		});
	});

	it('validates and saves a manifest payload', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([] as never);

		await POST({
			request: new Request('http://localhost/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'save-manifest',
					manifest: {
						version: 1,
						content: {
							items: ['posts']
						}
					}
				})
			}),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk'
				}
			},
			cookies: createCookies()
		} as never);

		expect(writeNavigationManifest).toHaveBeenCalledWith(
			expect.anything(),
			{
				version: 1,
				content: {
					items: ['posts']
				}
			},
			{
				message: 'Update Tentman navigation manifest',
				ref: 'tentman-preview'
			}
		);
	});

	it('adds a collection group through the manifest endpoint', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				slug: 'projects',
				path: 'content/projects.tentman.json',
				config: {
					type: 'content',
					_tentmanId: 'projects',
					label: 'Projects',
					collection: {
						sorting: 'manual'
					},
					content: {
						mode: 'directory'
					},
					blocks: []
				}
			}
		] as never);
		vi.mocked(loadNavigationManifestState).mockResolvedValueOnce({
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		});

		await POST({
			request: new Request('http://localhost/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'add-collection-group',
					collection: 'projects',
					id: 'tent_group_identity',
					value: 'identity',
					label: 'Identity'
				})
			}),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk'
				}
			},
			cookies: createCookies()
		} as never);

		expect(writeNavigationManifest).toHaveBeenCalledWith(
			expect.anything(),
			{
				version: 1,
				content: {
					items: ['about', 'posts']
				},
				collections: {
					projects: {
						items: [],
						groups: [{ id: 'tent_group_identity', label: 'Identity', value: 'identity', items: [] }]
					}
				}
			},
			{
				message: 'Update Tentman navigation manifest',
				ref: 'tentman-preview'
			}
		);
	});

	it('saves collection order through the manifest endpoint', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
				slug: 'projects',
				path: 'content/projects.tentman.json',
				config: {
					type: 'content',
					_tentmanId: 'projects',
					label: 'Projects',
					collection: {
						sorting: 'manual'
					},
					content: {
						mode: 'file',
						path: 'src/content/projects.json'
					},
					blocks: []
				}
			}
		] as never);

		await POST({
			request: new Request('http://localhost/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'save-collection-order',
					collection: 'projects',
					order: {
						ungroupedItems: [],
						groups: [{ id: 'identity', label: 'Identity', items: ['brand-system'] }]
					}
				})
			}),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(saveCollectionOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ slug: 'projects' }),
			{
				ungroupedItems: [],
				groups: [{ id: 'identity', label: 'Identity', items: ['brand-system'] }]
			},
			{
				version: 1,
				content: {
					items: ['about', 'posts']
				}
			},
			{
				message: 'Update Tentman navigation manifest',
				ref: 'tentman-preview'
			}
		);
	});
});
