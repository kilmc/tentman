import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { privateEnv } = vi.hoisted(() => ({
	privateEnv: {
		GITHUB_CLIENT_ID: '',
		GITHUB_CLIENT_SECRET: '',
		GITHUB_OAUTH_CALLBACK_URL: '',
		GITHUB_SESSION_SECRET: '',
		SITE_NAME: '',
		URL: '',
		NODE_ENV: 'test'
	}
}));

const { OctokitMock } = vi.hoisted(() => ({
	OctokitMock: vi.fn(() => ({
		hook: {
			error: vi.fn()
		}
	}))
}));

vi.mock('$env/dynamic/private', () => ({
	env: privateEnv
}));

vi.mock('octokit', () => ({
	Octokit: OctokitMock
}));

import {
	clearGitHubOAuthRequest,
	createGitHubServerClient,
	createGitHubOAuthState,
	GITHUB_REST_API_VERSION,
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
	getGitHubOAuthCallbackRelayUrl,
	getGitHubOAuthCallbackUrl,
	isGitHubOAuthConfigured,
	markGitHubLoginAttempt,
	persistGitHubOAuthRequest,
	persistGitHubSession,
	persistSelectedGitHubRepository,
	readRecentGitHubRepositories,
	readSelectedGitHubRepositorySession,
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
	privateEnv.GITHUB_OAUTH_CALLBACK_URL = values.GITHUB_OAUTH_CALLBACK_URL ?? '';
	privateEnv.GITHUB_SESSION_SECRET = values.GITHUB_SESSION_SECRET ?? '';
	privateEnv.SITE_NAME = values.SITE_NAME ?? '';
	privateEnv.URL = values.URL ?? '';
	privateEnv.NODE_ENV = values.NODE_ENV ?? 'test';
}

describe('server/auth/github', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
		setPrivateEnv({
			GITHUB_CLIENT_ID: '',
			GITHUB_CLIENT_SECRET: '',
			GITHUB_SESSION_SECRET: 'test-session-secret',
			NODE_ENV: 'test'
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates Octokit clients with explicit GitHub API version headers', () => {
		const cookies = createCookieStore();
		const hookError = vi.fn();
		OctokitMock.mockImplementationOnce(function MockOctokit() {
			return {
				hook: {
					error: hookError
				}
			};
		} as any);

		createGitHubServerClient('secret-token', cookies);

		expect(OctokitMock).toHaveBeenCalledWith({
			auth: 'secret-token',
			request: {
				headers: {
					'X-GitHub-Api-Version': GITHUB_REST_API_VERSION
				}
			}
		});
		expect(hookError).toHaveBeenCalledWith('request', expect.any(Function));
	});

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

	it('persists an opaque GitHub session cookie and keeps the token server-side', () => {
		const cookies = createCookieStore();
		setPrivateEnv({
			GITHUB_SESSION_SECRET: 'test-session-secret'
		});

		persistGitHubSession(cookies, {
			token: 'secret-token',
			user: {
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			}
		});

		expect(cookies.set).toHaveBeenCalledTimes(1);
		expect(cookies.values.get(GITHUB_TOKEN_COOKIE)).toBeUndefined();
		expect(cookies.values.get(GITHUB_SESSION_COOKIE)).toEqual(expect.any(String));
		expect(cookies.values.get(GITHUB_SESSION_COOKIE)).not.toBe('secret-token');
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

	it('treats an unknown session id as unauthenticated', () => {
		setPrivateEnv({
			GITHUB_SESSION_SECRET: 'test-session-secret'
		});
		const cookies = createCookieStore({
			[GITHUB_SESSION_COOKIE]: 'missing-session'
		});

		expect(readGitHubSession(cookies)).toEqual({});
	});

	it('persists the selected GitHub repo shell snapshot for later requests', () => {
		const cookies = createCookieStore();

		const repositoryIdentity = {
			mode: 'github',
			repoKey: 'github:acme/docs?ref=trunk',
			label: 'acme/docs',
			ref: 'trunk',
			headSha: 'head-trunk',
			treeSha: 'tree-trunk',
			resolvedAt: 1
		};

		persistSelectedGitHubRepository(
			cookies,
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk'
			},
			{
				siteName: 'Acme Docs',
				assets: {
					path: './static/images',
					publicPath: '/images'
				},
				netlify: {
					siteName: 'acme-docs'
				}
			},
			repositoryIdentity
		);

		expect(cookies.values.get(SELECTED_REPO_COOKIE)).toBe(
			'{"owner":"acme","name":"docs","full_name":"acme/docs","default_branch":"trunk"}'
		);
		expect(cookies.values.get(GITHUB_REPO_SESSION_COOKIE)).toBeTruthy();
		expect(readSelectedGitHubRepositorySession(cookies)).toEqual({
			selectedRepoConfigSummary: {
				siteName: 'Acme Docs',
				netlify: {
					siteName: 'acme-docs'
				},
				repositoryIdentity
			}
		});
		expect(readRecentGitHubRepositories(cookies)).toEqual([
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk',
				openedAt: expect.any(String)
			}
		]);
	});

	it('reads legacy selected repo session cookies that used the rootConfig key', () => {
		const cookies = createCookieStore({
			[GITHUB_REPO_SESSION_COOKIE]: Buffer.from(
				JSON.stringify({
					v: 1,
					rootConfig: {
						siteName: 'Legacy Docs'
					}
				})
			).toString('base64url')
		});

		expect(readSelectedGitHubRepositorySession(cookies)).toEqual({
			selectedRepoConfigSummary: {
				siteName: 'Legacy Docs'
			}
		});
	});

	it('falls back to the GitHub client secret for session encryption when no dedicated session secret is set', () => {
		setPrivateEnv({
			GITHUB_CLIENT_SECRET: 'github-client-secret'
		});
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

		expect(readGitHubSession(cookies)).toMatchObject({
			token: 'secret-token',
			user: {
				login: 'kilmc'
			}
		});
	});

	it('keeps recent repos ordered by last opened and deduplicated', () => {
		const cookies = createCookieStore({
			[RECENT_REPOS_COOKIE]: JSON.stringify([
				{
					owner: 'acme',
					name: 'blog',
					full_name: 'acme/blog',
					default_branch: 'main',
					openedAt: '2026-04-08T10:00:00.000Z'
				},
				{
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk',
					openedAt: '2026-04-07T10:00:00.000Z'
				}
			])
		});

		persistSelectedGitHubRepository(
			cookies,
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk'
			},
			null
		);

		expect(readRecentGitHubRepositories(cookies)).toEqual([
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk',
				openedAt: expect.any(String)
			},
			{
				owner: 'acme',
				name: 'blog',
				full_name: 'acme/blog',
				default_branch: 'main',
				openedAt: '2026-04-08T10:00:00.000Z'
			}
		]);
	});

	it('keeps cookie-backed GitHub sessions valid across shorter gaps between serverless invocations', () => {
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

		vi.setSystemTime(new Date('2026-05-09T12:00:01.000Z'));

		expect(readGitHubSession(cookies)).toMatchObject({
			token: 'secret-token'
		});
	});

	it('expires active GitHub sessions server-side after 30 days absolute lifetime', () => {
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

		vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
		expect(readGitHubSession(cookies)).toMatchObject({
			token: 'secret-token'
		});

		vi.setSystemTime(new Date('2026-05-31T12:00:01.000Z'));
		expect(readGitHubSession(cookies)).toEqual({});
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
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

	it('uses the request origin as the GitHub OAuth callback when no callback URL is configured', () => {
		expect(
			getGitHubOAuthCallbackUrl(
				new URL('https://deploy-preview-40--tentman.netlify.app/auth/login')
			)
		).toBe('https://deploy-preview-40--tentman.netlify.app/auth/callback');
	});

	it('uses the Netlify main site URL as the GitHub OAuth callback from deploy previews', () => {
		setPrivateEnv({
			SITE_NAME: 'tentman',
			URL: 'https://tentman.netlify.app'
		});

		expect(
			getGitHubOAuthCallbackUrl(
				new URL('https://deploy-preview-40--tentman.netlify.app/auth/login')
			)
		).toBe('https://tentman.netlify.app/auth/callback');
	});

	it('uses custom Netlify main site URLs as the GitHub OAuth callback from deploy previews', () => {
		setPrivateEnv({
			SITE_NAME: 'tentman',
			URL: 'https://admin.tentman.dev'
		});

		expect(
			getGitHubOAuthCallbackUrl(
				new URL('https://deploy-preview-40--tentman.netlify.app/auth/login')
			)
		).toBe('https://admin.tentman.dev/auth/callback');
	});

	it('does not use the Netlify main site URL outside matching deploy hosts', () => {
		setPrivateEnv({
			SITE_NAME: 'tentman',
			URL: 'https://tentman.netlify.app'
		});

		expect(getGitHubOAuthCallbackUrl(new URL('http://localhost:5173/auth/login'))).toBe(
			'http://localhost:5173/auth/callback'
		);
	});

	it('uses the configured GitHub OAuth callback URL when present', () => {
		setPrivateEnv({
			GITHUB_OAUTH_CALLBACK_URL: 'https://tentman.netlify.app/auth/callback',
			SITE_NAME: 'tentman',
			URL: 'https://other-tentman.netlify.app'
		});

		expect(
			getGitHubOAuthCallbackUrl(
				new URL('https://deploy-preview-40--tentman.netlify.app/auth/login')
			)
		).toBe('https://tentman.netlify.app/auth/callback');
	});

	it('builds a callback relay URL from a signed oauth state', () => {
		const state = createGitHubOAuthState({
			returnOrigin: 'https://deploy-preview-40--tentman.netlify.app'
		});
		const currentUrl = new URL(
			`https://tentman.netlify.app/auth/callback?code=abc123&state=${encodeURIComponent(state)}`
		);

		expect(
			getGitHubOAuthCallbackRelayUrl({
				callbackUrl: 'https://tentman.netlify.app/auth/callback',
				currentUrl,
				state
			})?.toString()
		).toBe(
			`https://deploy-preview-40--tentman.netlify.app/auth/callback?code=abc123&state=${encodeURIComponent(
				state
			)}`
		);
	});

	it('relays Netlify deploy preview callbacks when production has a different state secret', () => {
		const state = createGitHubOAuthState({
			returnOrigin: 'https://deploy-preview-40--tentman.netlify.app'
		});
		setPrivateEnv({
			GITHUB_SESSION_SECRET: 'production-session-secret',
			SITE_NAME: 'tentman',
			URL: 'https://tentman.netlify.app'
		});

		expect(
			getGitHubOAuthCallbackRelayUrl({
				callbackUrl: 'https://tentman.netlify.app/auth/callback',
				currentUrl: new URL(
					`https://tentman.netlify.app/auth/callback?code=abc123&state=${encodeURIComponent(
						state
					)}`
				),
				state
			})?.toString()
		).toBe(
			`https://deploy-preview-40--tentman.netlify.app/auth/callback?code=abc123&state=${encodeURIComponent(
				state
			)}`
		);
	});

	it('rejects relay state signed with a different secret when Netlify site context is unavailable', () => {
		const state = createGitHubOAuthState({
			returnOrigin: 'https://deploy-preview-40--tentman.netlify.app'
		});
		setPrivateEnv({
			GITHUB_SESSION_SECRET: 'production-session-secret'
		});

		expect(
			getGitHubOAuthCallbackRelayUrl({
				callbackUrl: 'https://tentman.netlify.app/auth/callback',
				currentUrl: new URL(
					`https://tentman.netlify.app/auth/callback?code=abc123&state=${encodeURIComponent(
						state
					)}`
				),
				state
			})
		).toBeNull();
	});

	it('rejects tampered oauth relay state to origins outside the Netlify site', () => {
		const state = createGitHubOAuthState({
			returnOrigin: 'https://deploy-preview-40--tentman.netlify.app'
		});
		const [, encodedPayload] = state.split('.');
		const tamperedPayload = Buffer.from(
			JSON.stringify({
				v: 1,
				nonce: 'nonce',
				returnOrigin: 'https://evil.example',
				issuedAt: Date.now()
			})
		).toString('base64url');
		const tamperedState = `relay.${tamperedPayload}.${state.split('.')[2]}`;
		setPrivateEnv({
			SITE_NAME: 'tentman',
			URL: 'https://tentman.netlify.app'
		});

		expect(encodedPayload).toEqual(expect.any(String));
		expect(
			getGitHubOAuthCallbackRelayUrl({
				callbackUrl: 'https://tentman.netlify.app/auth/callback',
				currentUrl: new URL(
					`https://tentman.netlify.app/auth/callback?code=abc123&state=${encodeURIComponent(
						tamperedState
					)}`
				),
				state: tamperedState
			})
		).toBeNull();
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
