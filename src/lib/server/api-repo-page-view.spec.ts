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

import { GET } from '../../routes/api/repo/page-view/+server';
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

const discoveredConfig = {
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

describe('GET /api/repo/page-view', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the GitHub-backed page view payload for a config slug', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig
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
			url: new URL('http://localhost/api/repo/page-view?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			content: [
				{
					_filename: 'hello-world.md',
					title: 'Hello world'
				}
			],
			mode: 'github',
			pageSlug: 'posts'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			discoveredConfig.config,
			discoveredConfig.path,
			discoveredConfig.slug,
			undefined
		);
	});

	it('loads an explicit draft branch when the caller opts in', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue({
			title: 'Draft about'
		});
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=posts&branch=preview-2026-04-06'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			content: {
				title: 'Draft about'
			},
			branch: 'preview-2026-04-06'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			discoveredConfig.config,
			discoveredConfig.path,
			discoveredConfig.slug,
			'preview-2026-04-06'
		);
	});

	it('clears the session and returns 401 when content fetch gets a GitHub 401', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig
		} as never);
		vi.mocked(getCachedContent).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/page-view?slug=posts'),
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
