import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

vi.mock('$lib/stores/github-repository-cache', () => ({
	githubRepositoryCache: {
		hydrateFromBootstrap: vi.fn(async () => {}),
		ensureCollectionIndex: vi.fn(async () => {}),
		getCollectionNavigation: vi.fn(async () => ({
			items: [],
			groups: []
		}))
	}
}));

const selectedRepo = {
	owner: 'acme',
	name: 'docs',
	full_name: 'acme/docs',
	default_branch: 'main'
};

function createParentData(groupManagement: boolean) {
	return {
		isAuthenticated: true,
		selectedBackend: {
			kind: 'github' as const,
			repo: selectedRepo
		},
		selectedRepo,
		repositoryIdentity: {
			repoKey: 'github:acme/docs?ref=main',
			mode: 'github',
			label: 'acme/docs',
			ref: 'main',
			headSha: 'head-main',
			treeSha: 'tree-main',
			resolvedAt: 1
		},
		configs: [
			{
				slug: 'projects',
				path: 'tentman/configs/projects.tentman.json',
				config: {
					type: 'content',
					_tentmanId: 'projects',
					id: 'projects',
					label: 'Projects',
					collection: {
						groupManagement,
						groups: []
					},
					content: {
						mode: 'file',
						path: 'src/content/projects.json'
					},
					blocks: []
				}
			}
		],
		blockConfigs: [],
		rootConfig: null,
		activeDraftBranch: null,
		singletonContentIdentities: {},
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: []
					}
				}
			},
			error: null
		}
	};
}

describe('routes/pages/[page]/groups/+page', () => {
	it('redirects GitHub routes when collection group management is not enabled', async () => {
		await expect(
			load({
				parent: async () => createParentData(false),
				params: {
					page: 'projects'
				},
				fetch: vi.fn()
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages/projects'
		});
	});

	it('loads group management data when enabled', async () => {
		await expect(
			load({
				parent: async () => createParentData(true),
				params: {
					page: 'projects'
				},
				fetch: vi.fn()
			} as never)
		).resolves.toMatchObject({
			discoveredConfig: {
				slug: 'projects'
			},
			pageSlug: 'projects',
			collectionNavigation: {
				items: [],
				groups: []
			}
		});
	});
});
