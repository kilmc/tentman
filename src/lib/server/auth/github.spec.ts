import { describe, expect, it, vi } from 'vitest';
import {
	getGitHubClientId,
	getGitHubOAuthCredentials,
	GITHUB_SESSION_COOKIE,
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE,
	clearGitHubSession,
	handleGitHubSessionError,
	persistGitHubSession,
	persistSelectedGitHubRepository,
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

describe('server/auth/github', () => {
	it('reads the GitHub OAuth config from runtime env instead of build-time imports', () => {
		vi.stubEnv('GITHUB_CLIENT_ID', ' github-client-id ');
		vi.stubEnv('GITHUB_CLIENT_SECRET', ' github-client-secret ');

		expect(getGitHubClientId()).toBe('github-client-id');
		expect(getGitHubOAuthCredentials()).toEqual({
			clientId: 'github-client-id',
			clientSecret: 'github-client-secret'
		});
	});

	it('returns a 503 when GitHub OAuth is not configured', () => {
		vi.stubEnv('GITHUB_CLIENT_ID', '');
		vi.stubEnv('GITHUB_CLIENT_SECRET', '');

		expectHttpError(getGitHubClientId, {
			status: 503,
			message: 'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_ID.'
		});
		expectHttpError(getGitHubOAuthCredentials, {
			status: 503,
			message: 'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_ID.'
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
	});

	it('clears auth and GitHub repo selection cookies together', () => {
		const cookies = createCookieStore({
			[GITHUB_TOKEN_COOKIE]: 'secret-token',
			[GITHUB_SESSION_COOKIE]: 'session',
			[GITHUB_REPO_SESSION_COOKIE]: 'repo-session',
			[SELECTED_REPO_COOKIE]: '{"owner":"acme","name":"repo","full_name":"acme/repo"}',
			selected_backend_kind: 'github'
		});

		clearGitHubSession(cookies);

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('selected_backend_kind', { path: '/' });
	});

	it('redirects to login after clearing the session on a GitHub 401 in route code', () => {
		const cookies = createCookieStore({
			[GITHUB_TOKEN_COOKIE]: 'secret-token'
		});

		try {
			handleGitHubSessionError({ cookies }, { status: 401 }, { redirectTo: '/pages/posts' });
		} catch (error) {
			expect(error).toMatchObject({
				status: 302,
				location: '/auth/login?redirect=/pages/posts'
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
