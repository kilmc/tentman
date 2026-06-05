import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import {
	githubRepositoryCache,
	githubRepositoryCacheTestApi
} from '$lib/stores/github-repository-cache';
import { load as loadCollectionLanding } from '../../../routes/pages/[page]/+page';

function createBootstrap(): RepoConfigsBootstrap {
	return {
		isAuthenticated: true,
		githubOAuthConfigured: true,
		user: null,
		recentRepos: [],
		selectedBackend: {
			kind: 'github',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			}
		},
		selectedRepo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		},
		activeDraftBranch: null,
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
					label: 'Projects',
					collection: true,
					idField: 'slug',
					content: {
						mode: 'directory',
						path: '../../src/content/projects',
						template: '../../src/content/projects/_template.md'
					},
					blocks: [{ id: 'title', type: 'text', label: 'Title' }]
				}
			}
		],
		blockConfigs: [],
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		}
	} as RepoConfigsBootstrap;
}

function createIndexPayload() {
	return {
		identity: {
			repoKey: 'github:acme/docs?ref=main',
			ref: 'main',
			headSha: 'head-main',
			treeSha: 'tree-main',
			configSlug: 'projects',
			configPath: 'tentman/configs/projects.tentman.json',
			contentIdentity: 'src/content/projects:src/content/projects/_template.md',
			schemaIdentity: 'title'
		},
		configSlug: 'projects',
		mode: 'directory' as const,
		items: [
			{
				itemId: 'panorama-4',
				route: 'panorama-4',
				path: 'src/content/projects/panorama-4.md',
				filename: 'panorama-4.md',
				blobSha: 'blob-panorama',
				title: 'panorama 4',
				sortDate: null,
				hydration: 'fallback' as const,
				hrefItemId: 'panorama-4'
			}
		]
	};
}

function createLoadEvent(fetch: typeof globalThis.fetch) {
	return {
		parent: async () => createBootstrap(),
		fetch,
		params: {
			page: 'projects'
		},
		url: new URL('http://localhost/pages/projects'),
		depends: vi.fn()
	};
}

describe('GitHub collection route cache in the browser', () => {
	beforeEach(async () => {
		await githubRepositoryCacheTestApi.reset();
	});

	afterEach(async () => {
		await githubRepositoryCacheTestApi.reset();
	});

	it('returns warm collection navigation without calling the page-view endpoint', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/page-view')) {
				throw new Error('collection landing should not call page-view');
			}
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createIndexPayload());
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const firstResult = await loadCollectionLanding(createLoadEvent(fetch) as never);
		const secondResult = await loadCollectionLanding(createLoadEvent(fetch) as never);

		expect(firstResult).toMatchObject({
			pageSlug: 'projects',
			collectionNavigation: {
				items: [{ title: 'panorama 4', hydration: 'fallback' }]
			}
		});
		expect(secondResult).toMatchObject({
			pageSlug: 'projects',
			collectionNavigation: {
				items: [{ title: 'panorama 4', hydration: 'fallback' }]
			}
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith('/api/repo/collection-index?slug=projects');

		await expect(githubRepositoryCache.getCollectionNavigation('projects')).resolves.toMatchObject({
			items: [{ title: 'panorama 4' }]
		});
	});
});
