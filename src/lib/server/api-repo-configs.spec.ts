import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn(() => ({
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null)
	}))
}));

vi.mock('$lib/server/auth/github', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth/github')>('$lib/server/auth/github');

	return {
		...actual,
		createGitHubServerClient: vi.fn(() => ({ rest: {} }))
	};
});

import { GET } from '../../routes/api/repo/configs/+server';
import { getCachedConfigs } from '$lib/stores/config-cache';
import {
	createGitHubServerClient,
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

describe('GET /api/repo/configs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns config discovery data for the selected repository', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([
			{
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
			}
		] as never);

		const cookies = createCookies();
		const response = await GET({
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
		} as never);

		expect(createGitHubServerClient).toHaveBeenCalledWith('secret-token', cookies);
		expect(await response.json()).toEqual({
			configs: [
				{
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
				}
			],
			blockConfigs: [],
			rootConfig: null
		});
	});

	it('clears the session and returns 401 when GitHub rejects config discovery', async () => {
		vi.mocked(getCachedConfigs).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
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
