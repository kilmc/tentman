import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/auth/github', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth/github')>('$lib/server/auth/github');

	return {
		...actual,
		createGitHubServerClient: vi.fn(() => ({ rest: {} }))
	};
});

import { GET } from '../../routes/api/repo/collection-items/+server';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { getCachedContent } from '$lib/stores/content-cache';
import {
	createGitHubServerClient,
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

describe('GET /api/repo/collection-items', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns collection navigation items for the requested slug', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([collectionConfig] as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		const cookies = createCookies();
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
			cookies
		} as never);

		expect(createGitHubServerClient).toHaveBeenCalledWith('secret-token', cookies);
		expect(await response.json()).toEqual({
			items: [
				{
					itemId: 'hello-world',
					title: 'Hello world'
				}
			]
		});
	});

	it('clears the session and returns 401 when GitHub rejects the request', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([collectionConfig] as never);
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
