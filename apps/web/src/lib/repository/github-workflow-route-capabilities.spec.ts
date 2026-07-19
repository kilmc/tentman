import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

const cacheMocks = vi.hoisted(() => ({
	hydrateFromBootstrap: vi.fn(),
	loadCollectionNavigationWorkflowData: vi.fn(),
	loadPageViewWorkflowData: vi.fn(),
	loadItemViewWorkflowData: vi.fn(),
	loadExistingItemsForRoute: vi.fn(),
	getSingletonDocumentForRoute: vi.fn(),
	setSingletonPageView: vi.fn()
}));

vi.mock('$lib/stores/github-repository-cache', () => ({
	githubRepositoryCache: cacheMocks
}));

import { githubWorkflowRouteCapabilities } from './github-workflow-route-capabilities';

function createBootstrap(): RepoConfigsBootstrap {
	return {
		...EMPTY_REPO_CONFIGS_BOOTSTRAP,
		configs: [
			{
				slug: 'about',
				path: 'tentman/configs/about.tentman.json',
				config: {
					type: 'content',
					label: 'About',
					collection: false,
					content: {
						mode: 'file',
						path: '../../src/content/about.md'
					},
					blocks: []
				}
			}
		],
		selectedRepo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		},
		selectedBackend: {
			kind: 'github',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			}
		},
		repositoryIdentity: {
			repoKey: 'github:acme/docs?ref=main',
			mode: 'github',
			label: 'acme/docs',
			ref: 'main',
			headSha: 'head-main',
			treeSha: 'tree-main',
			resolvedAt: 1
		}
	} as RepoConfigsBootstrap;
}

describe('githubWorkflowRouteCapabilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cacheMocks.hydrateFromBootstrap.mockResolvedValue(undefined);
		cacheMocks.loadExistingItemsForRoute.mockResolvedValue([]);
		cacheMocks.getSingletonDocumentForRoute.mockResolvedValue(null);
		cacheMocks.setSingletonPageView.mockResolvedValue(undefined);
	});

	it('hydrates the route workflow before loading existing items', async () => {
		const bootstrap = createBootstrap();
		const fetcher = vi.fn();

		await expect(
			githubWorkflowRouteCapabilities.loadExistingItemsForRoute({
				repoFullName: 'acme/docs',
				bootstrap,
				slug: 'posts',
				fetcher,
				priority: 'foreground'
			})
		).resolves.toEqual([]);

		expect(cacheMocks.hydrateFromBootstrap).toHaveBeenCalledWith({
			repoFullName: 'acme/docs',
			bootstrap
		});
		expect(cacheMocks.loadExistingItemsForRoute).toHaveBeenCalledWith('posts', {
			fetcher,
			priority: 'foreground'
		});
	});

	it('keeps singleton edit API fallback and cache seeding behind the capability boundary', async () => {
		const bootstrap = createBootstrap();
		const fetcher = vi.fn(async () =>
			Response.json({
				discoveredConfig: bootstrap.configs[0],
				blockConfigs: [{ id: 'hero', path: 'tentman/blocks/hero.tentman.json', config: {} }],
				packageBlocks: [],
				blockRegistryError: null,
				content: {
					title: 'About Tentman'
				},
				contentError: null,
				branch: 'tentman-preview',
				pageSlug: 'about',
				mode: 'github'
			})
		);

		const result = await githubWorkflowRouteCapabilities.loadSingletonEditWorkflowData({
			repoFullName: 'acme/docs',
			bootstrap,
			slug: 'about',
			fetcher
		});

		expect(result).toMatchObject({
			status: 'ready',
			data: {
				content: {
					title: 'About Tentman'
				},
				editor: {
					status: 'draft',
					isDraft: true,
					recoveryContextKey: expect.stringMatching(/^editor:dataset:/),
					message: 'Changes will continue in the current draft.'
				},
				pageSlug: 'about',
				mode: 'github'
			}
		});
		expect(JSON.stringify(result)).not.toContain('branch');
		expect(JSON.stringify(result)).not.toContain('tentman-preview');

		expect(fetcher).toHaveBeenCalledWith('/api/repo/page-view?slug=about');
		expect(cacheMocks.setSingletonPageView).toHaveBeenCalledWith({
			slug: 'about',
			content: {
				title: 'About Tentman'
			},
			blockConfigs: [{ id: 'hero', path: 'tentman/blocks/hero.tentman.json', config: {} }],
			packageBlocks: [],
			blockRegistryError: null
		});
	});
});
