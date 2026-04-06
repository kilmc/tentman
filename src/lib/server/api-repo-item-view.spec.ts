import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/block-registry-data', () => ({
	loadGitHubBlockRegistryData: vi.fn()
}));

import { GET } from '../../routes/api/repo/item-view/+server';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { requireDiscoveredConfig } from '$lib/server/page-context';
import { getCachedContent } from '$lib/stores/content-cache';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

const collectionConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		label: 'Posts',
		collection: true,
		content: {
			mode: 'directory'
		},
		blocks: [
			{
				id: 'title',
				type: 'text'
			}
		]
	}
} as const;

describe('GET /api/repo/item-view', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the selected collection item payload', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			item: {
				_filename: 'hello-world.md',
				title: 'Hello world'
			},
			itemId: 'hello-world',
			mode: 'github',
			pageSlug: 'posts'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			collectionConfig.config,
			collectionConfig.path,
			collectionConfig.slug,
			undefined
		);
	});

	it('loads an explicit draft branch when the caller opts in', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Draft title'
			}
		]);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL(
				'http://localhost/api/repo/item-view?slug=posts&itemId=hello-world&branch=preview-2026-04-06'
			),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			item: {
				title: 'Draft title'
			},
			branch: 'preview-2026-04-06'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			collectionConfig.config,
			collectionConfig.path,
			collectionConfig.slug,
			'preview-2026-04-06'
		);
	});

	it('returns a redirect target when the config is not a collection', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				...collectionConfig,
				config: {
					...collectionConfig.config,
					collection: false
				}
			}
		} as never);

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			redirectTo: '/pages/posts/edit'
		});
	});

	it('clears the session and returns 401 when content fetch gets a GitHub 401', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(getCachedContent).mockRejectedValue({ status: 401 });
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/item-view?slug=posts&itemId=hello-world'),
				locals: {},
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
	});
});
