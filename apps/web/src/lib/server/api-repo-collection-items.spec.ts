import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repo-config-bootstrap', () => ({
	loadSelectedGitHubRepoBootstrapContext: vi.fn()
}));

import { GET } from '../../routes/api/repo/collection-items/+server';
import { getCachedContent } from '$lib/stores/content-cache';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

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

function createCookies() {
	return {
		delete: vi.fn()
	};
}

function createBootstrapContext(configs: unknown[]) {
	return {
		backend: { cacheKey: 'github:acme/docs' },
		configs,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		rootConfig: null
	} as const;
}

describe('GET /api/repo/collection-items', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns collection navigation items for the requested slug', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([collectionConfig]) as never
		);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
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

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'hello-world',
					title: 'Hello world',
					sortDate: null
				}
			],
			groups: []
		});
	});

	it('returns slug-based items when manual sorting is not enabled and Tentman ids are missing', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([
				{
					...collectionConfig,
					config: {
						...collectionConfig.config,
						collection: true,
						blocks: [
							...collectionConfig.config.blocks,
							{
								id: 'date',
								type: 'date'
							}
						]
					}
				}
			]) as never
		);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'latest-news.md',
				title: 'Latest news',
				date: '2026-04-03'
			}
		]);

		const response = await GET({
			url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
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

		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'latest-news',
					title: 'Latest news',
					sortDate: new Date('2026-04-03').getTime()
				}
			],
			groups: []
		});
	});

	it('clears the session and returns 401 when GitHub rejects the request', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue(
			createBootstrapContext([collectionConfig]) as never
		);
		vi.mocked(getCachedContent).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/collection-items?slug=posts'),
				locals: {
					isAuthenticated: true,
					githubToken: 'secret-token',
					selectedRepo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					}
				},
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
