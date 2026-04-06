import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth/github')>(
		'$lib/server/auth/github'
	);

	return {
		...actual,
		createGitHubServerClient: vi.fn()
	};
});

import { GET } from '../../routes/api/repos/+server';
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

describe('GET /api/repos', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the authenticated repo list', async () => {
		vi.mocked(createGitHubServerClient).mockReturnValue({
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({
						data: [
							{
								id: 1,
								name: 'docs',
								full_name: 'acme/docs',
								owner: { login: 'acme' },
								description: 'Docs repo',
								private: true,
								updated_at: '2026-04-05T18:30:00.000Z'
							}
						]
					})
				}
			}
		} as never);

		const response = await GET({
			locals: {
				isAuthenticated: true,
				githubToken: 'token'
			},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			repos: [
				{
					id: 1,
					name: 'docs',
					full_name: 'acme/docs',
					owner: 'acme',
					description: 'Docs repo',
					private: true,
					updated_at: '2026-04-05T18:30:00.000Z'
				}
			]
		});
	});

	it('clears the session and returns 401 on GitHub auth failure', async () => {
		vi.mocked(createGitHubServerClient).mockReturnValue({
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockRejectedValue({ status: 401 })
				}
			}
		} as never);

		const cookies = createCookies();

		await expect(
			GET({
				locals: {
					isAuthenticated: true,
					githubToken: 'token'
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
