import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn()
}));

vi.mock('$lib/github/branch', () => ({
	listPreviewBranches: vi.fn(),
	getCommitsSince: vi.fn()
}));

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn()
}));

vi.mock('$lib/utils/draft-comparison', () => ({
	compareDraftToBranch: vi.fn()
}));

import { GET } from '../../routes/api/repo/publish-view/+server';
import { getCommitsSince, listPreviewBranches } from '$lib/github/branch';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { requireGitHubRepository } from '$lib/server/page-context';
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

describe('GET /api/repo/publish-view', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the publish review bootstrap payload', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			backend: { cacheKey: 'github:acme/docs' }
		} as never);
		vi.mocked(listPreviewBranches).mockResolvedValue([
			{
				name: 'preview-2026-04-05',
				date: '2026-04-05',
				sequence: 1,
				lastCommitDate: '2026-04-05T12:00:00.000Z',
				lastCommitSha: 'abc123'
			}
		]);
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
			},
			{
				slug: 'about',
				path: 'content/about.tentman.json',
				config: {
					label: 'About',
					collection: false,
					content: {
						mode: 'file'
					},
					blocks: []
				}
			}
		] as never);
		vi.mocked(compareDraftToBranch)
			.mockResolvedValueOnce({
				modified: [{ path: 'content/posts/hello-world.md' }],
				created: [],
				deleted: []
			} as never)
			.mockResolvedValueOnce({
				modified: [],
				created: [],
				deleted: []
			} as never);
		vi.mocked(getCommitsSince).mockResolvedValue([
			{
				sha: 'abc123',
				message: 'Update content',
				author: {
					name: 'Kilian',
					email: 'kilian@example.com',
					date: '2026-04-05T12:00:00.000Z'
				},
				url: 'https://github.com/acme/docs/commit/abc123'
			}
		]);

		const response = await GET({
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			draftBranch: {
				name: 'preview-2026-04-05'
			},
			configsWithChanges: [
				{
					config: {
						slug: 'posts'
					}
				}
			],
			commits: [
				{
					sha: 'abc123'
				}
			]
		});
	});

	it('clears the session and returns 401 on GitHub auth failure', async () => {
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			backend: { cacheKey: 'github:acme/docs' }
		} as never);
		vi.mocked(listPreviewBranches).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
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
