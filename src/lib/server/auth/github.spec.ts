import { describe, expect, it, vi } from 'vitest';

const { privateEnv } = vi.hoisted(() => ({
	privateEnv: {
		GITHUB_CLIENT_ID: '',
		GITHUB_CLIENT_SECRET: '',
		NODE_ENV: 'test'
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: privateEnv
}));

import {
	clearGitHubOAuthRequest,
	createGitHubOAuthState,
	getGitHubClientId,
	getGitHubOAuthCredentials,
	GITHUB_LOGIN_COOLDOWN_COOKIE,
	GITHUB_OAUTH_REDIRECT_COOKIE,
	GITHUB_OAUTH_STATE_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	RECENT_REPOS_COOKIE,
	SELECTED_REPO_COOKIE,
	clearGitHubSession,
	hasRecentGitHubLoginAttempt,
	handleGitHubSessionError,
	isGitHubOAuthConfigured,
	markGitHubLoginAttempt,
	persistGitHubOAuthRequest,
	persistGitHubSession,
	persistSelectedGitHubRepository,
	readRecentGitHubRepositories,
	readGitHubOAuthRequest,
	readGitHubSession
} from './github';

function expectHttpError(
	callback: () => unknown,
	expected: {
		status: number;
		message: string;
	}
) {
	try {
		callback();
		throw new Error('Expected callback to throw');
	} catch (error) {
		expect(error).toMatchObject({
			status: expected.status,
			body: {
				message: expected.message
			}
		});
	}
}

function createCookieStore(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));

	return {
		values,
		get: vi.fn((name: string) => values.get(name)),
		set: vi.fn((name: string, value: string) => {
			values.set(name, value);
		}),
		delete: vi.fn((name: string) => {
			values.delete(name);
		})
	};
}

function setPrivateEnv(values: Partial<typeof privateEnv>) {
	privateEnv.GITHUB_CLIENT_ID = values.GITHUB_CLIENT_ID ?? '';
	privateEnv.GITHUB_CLIENT_SECRET = values.GITHUB_CLIENT_SECRET ?? '';
	privateEnv.NODE_ENV = values.NODE_ENV ?? 'test';
}

describe('server/auth/github', () => {
	it('reads the GitHub OAuth config from runtime env instead of build-time imports', () => {
		setPrivateEnv({
			GITHUB_CLIENT_ID: ' github-client-id ',
			GITHUB_CLIENT_SECRET: ' github-client-secret '
		});

		expect(isGitHubOAuthConfigured()).toBe(true);
		expect(getGitHubClientId()).toBe('github-client-id');
		expect(getGitHubOAuthCredentials()).toEqual({
			clientId: 'github-client-id',
			clientSecret: 'github-client-secret'
		});
	});

	it('returns a 503 when GitHub OAuth is not configured', () => {
		setPrivateEnv({
			GITHUB_CLIENT_ID: '',
			GITHUB_CLIENT_SECRET: ''
		});

		expect(isGitHubOAuthConfigured()).toBe(false);
		expectHttpError(getGitHubClientId, {
			status: 503,
			message: 'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_ID.'
		});
		expectHttpError(getGitHubOAuthCredentials, {
			status: 503,
			message: 'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_ID.'
		});
	});

	it('treats a missing client secret as not configured', () => {
		setPrivateEnv({
			GITHUB_CLIENT_ID: 'github-client-id',
			GITHUB_CLIENT_SECRET: ''
		});

		expect(isGitHubOAuthConfigured()).toBe(false);
		expectHttpError(getGitHubOAuthCredentials, {
			status: 503,
			message: 'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_SECRET.'
		});
	});

	it('persists and reads the GitHub session snapshot separately from the token', () => {
		const cookies = createCookieStore();

		persistGitHubSession(cookies, {
			token: 'secret-token',
			user: {
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			}
		});

		expect(cookies.set).toHaveBeenCalledTimes(2);
		expect(cookies.values.get(GITHUB_TOKEN_COOKIE)).toBe('secret-token');
		expect(cookies.values.get(GITHUB_SESSION_COOKIE)).toBeTruthy();
		expect(readGitHubSession(cookies)).toEqual({
			token: 'secret-token',
			user: {
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			}
		});
	});

	it('ignores a malformed session snapshot without discarding the token', () => {
		const cookies = createCookieStore({
			[GITHUB_TOKEN_COOKIE]: 'secret-token',
			[GITHUB_SESSION_COOKIE]: 'definitely-not-base64'
		});

		expect(readGitHubSession(cookies)).toEqual({
			token: 'secret-token'
		});
	});

	it('persists the selected GitHub repo shell snapshot for later requests', () => {
		const cookies = createCookieStore();

		persistSelectedGitHubRepository(
			cookies,
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			},
			{
				siteName: 'Acme Docs'
			}
		);

		expect(cookies.values.get(SELECTED_REPO_COOKIE)).toBe(
			'{"owner":"acme","name":"docs","full_name":"acme/docs"}'
		);
		expect(cookies.values.get(GITHUB_REPO_SESSION_COOKIE)).toBeTruthy();
		expect(readRecentGitHubRepositories(cookies)).toEqual([
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				openedAt: expect.any(String)
			}
		]);
	});

	it('keeps recent repos ordered by last opened and deduplicated', () => {
		const cookies = createCookieStore({
			[RECENT_REPOS_COOKIE]: JSON.stringify([
				{
					owner: 'acme',
					name: 'blog',
					full_name: 'acme/blog',
					openedAt: '2026-04-08T10:00:00.000Z'
				},
				{
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					openedAt: '2026-04-07T10:00:00.000Z'
				}
			])
		});

		persistSelectedGitHubRepository(
			cookies,
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			},
			null
		);

		expect(readRecentGitHubRepositories(cookies)).toEqual([
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				openedAt: expect.any(String)
			},
			{
				owner: 'acme',
				name: 'blog',
				full_name: 'acme/blog',
				openedAt: '2026-04-08T10:00:00.000Z'
			}
		]);
	});

	it('clears auth and GitHub repo selection cookies together', () => {
		const cookies = createCookieStore({
			[GITHUB_TOKEN_COOKIE]: 'secret-token',
			[GITHUB_SESSION_COOKIE]: 'session',
			[GITHUB_REPO_SESSION_COOKIE]: 'repo-session',
			[SELECTED_REPO_COOKIE]: '{"owner":"acme","name":"repo","full_name":"acme/repo"}',
			[RECENT_REPOS_COOKIE]: '[]',
			[GITHUB_LOGIN_COOLDOWN_COOKIE]: '1',
			[GITHUB_OAUTH_STATE_COOKIE]: 'state',
			[GITHUB_OAUTH_REDIRECT_COOKIE]: '/pages',
			selected_backend_kind: 'github'
		});

		clearGitHubSession(cookies);

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('selected_backend_kind', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(RECENT_REPOS_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_LOGIN_COOLDOWN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_OAUTH_STATE_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_OAUTH_REDIRECT_COOKIE, { path: '/' });
	});

	it('tracks a recent login attempt with a short-lived cooldown cookie', () => {
		const cookies = createCookieStore();

		expect(hasRecentGitHubLoginAttempt(cookies)).toBe(false);
		markGitHubLoginAttempt(cookies);
		expect(hasRecentGitHubLoginAttempt(cookies)).toBe(true);
		expect(cookies.set).toHaveBeenCalledWith(
			GITHUB_LOGIN_COOLDOWN_COOKIE,
			'1',
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 15
			})
		);
	});

	it('stores and clears the pending oauth state and post-login redirect', () => {
		const cookies = createCookieStore();
		const state = createGitHubOAuthState();

		expect(state).toMatch(/^[a-f0-9]{64}$/);

		persistGitHubOAuthRequest(cookies, {
			state: 'oauth-state-token',
			redirectTo: '/pages/posts'
		});

		expect(readGitHubOAuthRequest(cookies)).toEqual({
			state: 'oauth-state-token',
			redirectTo: '/pages/posts'
		});

		clearGitHubOAuthRequest(cookies);

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_OAUTH_STATE_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_OAUTH_REDIRECT_COOKIE, { path: '/' });
	});

	it('redirects to repos after clearing the session on a GitHub 401 in route code', () => {
		const cookies = createCookieStore({
			[GITHUB_TOKEN_COOKIE]: 'secret-token'
		});

		try {
			handleGitHubSessionError({ cookies }, { status: 401 }, { redirectTo: '/pages/posts' });
		} catch (error) {
			expect(error).toMatchObject({
				status: 302,
				location: '/repos?returnTo=%2Fpages%2Fposts'
			});
		}

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
	});

	it('returns a 401 for API callers after clearing the session on a GitHub 401', () => {
		const cookies = createCookieStore({
			[GITHUB_TOKEN_COOKIE]: 'secret-token'
		});

		try {
			handleGitHubSessionError({ cookies }, { status: 401 });
		} catch (error) {
			expect(error).toMatchObject({
				status: 401
			});
		}

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
	});
});
