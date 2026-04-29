import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', () => ({
	isGitHubOAuthConfigured: vi.fn(() => true),
	GITHUB_REPO_SESSION_COOKIE: 'github_repo_session',
	SELECTED_REPO_COOKIE: 'selected_repo',
	getGitHubCookieOptions: vi.fn(() => ({
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	}))
}));

import { POST } from './+server';

function createCookies() {
	return {
		set: vi.fn(),
		delete: vi.fn()
	};
}

describe('routes/api/session/backend/+server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('commits local backend selection on the server and clears stale GitHub repo cookies', async () => {
		const cookies = createCookies();

		const response = await POST({
			request: new Request('http://localhost/api/session/backend', {
				method: 'POST',
				body: JSON.stringify({
					kind: 'local',
					repo: {
						name: 'Docs',
						pathLabel: '~/Sites/docs'
					}
				}),
				headers: {
					'content-type': 'application/json'
				}
			}),
			cookies,
			locals: {
				isAuthenticated: true,
				user: {
					login: 'kilmc',
					name: 'Kilian',
					avatar_url: 'https://avatars.example/kilmc',
					email: 'kilian@example.com'
				},
				recentRepos: []
			}
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			selectedBackend: {
				kind: 'local',
				repo: {
					name: 'Docs',
					pathLabel: '~/Sites/docs'
				}
			},
			selectedRepo: null,
			selectionCommitted: true
		});
		expect(cookies.delete).toHaveBeenCalledWith('selected_backend_kind', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('selected_local_repo', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('selected_repo', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('github_repo_session', { path: '/' });
		expect(cookies.set).toHaveBeenCalledWith(
			'selected_backend_kind',
			'local',
			expect.objectContaining({
				httpOnly: true,
				path: '/'
			})
		);
		expect(cookies.set).toHaveBeenCalledWith(
			'selected_local_repo',
			JSON.stringify({
				name: 'Docs',
				pathLabel: '~/Sites/docs'
			}),
			expect.objectContaining({
				httpOnly: true,
				path: '/'
			})
		);
	});

	it('clears backend selection when switching back to no active repo', async () => {
		const cookies = createCookies();

		const response = await POST({
			request: new Request('http://localhost/api/session/backend', {
				method: 'POST',
				body: JSON.stringify({
					kind: 'none'
				}),
				headers: {
					'content-type': 'application/json'
				}
			}),
			cookies,
			locals: {
				isAuthenticated: true,
				recentRepos: []
			}
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			selectedBackend: null,
			selectedRepo: null,
			selectionCommitted: true
		});
		expect(cookies.delete).toHaveBeenCalledWith('selected_repo', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('github_repo_session', { path: '/' });
	});
});
