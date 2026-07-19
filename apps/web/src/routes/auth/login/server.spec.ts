import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', () => ({
	createGitHubOAuthState: vi.fn(() => 'oauth-state-token'),
	getGitHubOAuthCallbackUrl: vi.fn((url: URL) => new URL('/auth/callback', url).toString()),
	getGitHubClientId: vi.fn(() => 'github-client-id'),
	getGitHubOAuthStateFingerprint: vi.fn((state: string | null | undefined) =>
		state ? 'state-fingerprint' : null
	),
	hasRecentGitHubLoginAttempt: vi.fn(() => false),
	isGitHubOAuthConfigured: vi.fn(() => true),
	logGitHubOAuthDebug: vi.fn(),
	markGitHubLoginAttempt: vi.fn(),
	persistGitHubOAuthRequest: vi.fn()
}));

import { GET } from './+server';
import {
	createGitHubOAuthState,
	getGitHubOAuthCallbackUrl,
	hasRecentGitHubLoginAttempt,
	isGitHubOAuthConfigured,
	markGitHubLoginAttempt,
	persistGitHubOAuthRequest
} from '$lib/server/auth/github';

describe('routes/auth/login/+server', () => {
	beforeEach(() => {
		vi.mocked(createGitHubOAuthState).mockReturnValue('oauth-state-token');
		vi.mocked(getGitHubOAuthCallbackUrl).mockImplementation((url: URL) =>
			new URL('/auth/callback', url).toString()
		);
		vi.mocked(hasRecentGitHubLoginAttempt).mockReturnValue(false);
		vi.mocked(isGitHubOAuthConfigured).mockReturnValue(true);
		vi.mocked(markGitHubLoginAttempt).mockClear();
		vi.mocked(persistGitHubOAuthRequest).mockClear();
	});

	it('redirects back home when GitHub OAuth is not configured', async () => {
		vi.mocked(isGitHubOAuthConfigured).mockReturnValue(false);

		await expect(
			GET({
				url: new URL('http://localhost/auth/login?redirect=/pages'),
				cookies: {
					get: vi.fn(),
					set: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/?github_oauth=unavailable'
		});
	});

	it('sanitizes redirect targets before sending users to GitHub', async () => {
		vi.mocked(isGitHubOAuthConfigured).mockReturnValue(true);
		const cookies = {
			get: vi.fn(),
			set: vi.fn()
		};

		try {
			await GET({
				url: new URL('http://localhost/auth/login?redirect=/auth/login?redirect=/pages'),
				cookies
			} as never);
		} catch (error) {
			expect(error).toMatchObject({
				status: 302
			});

			const redirectLocation = (error as { location?: string }).location;
			expect(redirectLocation).toEqual(expect.any(String));
			const location = new URL(redirectLocation as string, 'http://localhost');
			expect(location.origin).toBe('https://github.com');
			expect(location.searchParams.get('state')).toBe('oauth-state-token');
			expect(location.searchParams.get('redirect_uri')).toBe('http://localhost/auth/callback');
			expect(persistGitHubOAuthRequest).toHaveBeenCalledWith(cookies, {
				state: 'oauth-state-token',
				redirectTo: '/repos'
			});
			expect(markGitHubLoginAttempt).toHaveBeenCalledWith(cookies);
			return;
		}

		throw new Error('Expected login route to redirect');
	});

	it('uses the configured GitHub callback URL from deploy previews', async () => {
		vi.mocked(isGitHubOAuthConfigured).mockReturnValue(true);
		vi.mocked(getGitHubOAuthCallbackUrl).mockReturnValue(
			'https://tentman.netlify.app/auth/callback'
		);
		const cookies = {
			get: vi.fn(),
			set: vi.fn()
		};

		try {
			await GET({
				url: new URL('https://deploy-preview-40--tentman.netlify.app/auth/login?redirect=/repos'),
				cookies
			} as never);
		} catch (error) {
			expect(error).toMatchObject({
				status: 302
			});

			const redirectLocation = (error as { location?: string }).location;
			expect(redirectLocation).toEqual(expect.any(String));
			const location = new URL(redirectLocation as string);
			expect(location.searchParams.get('redirect_uri')).toBe(
				'https://tentman.netlify.app/auth/callback'
			);
			expect(createGitHubOAuthState).toHaveBeenCalledWith({
				returnOrigin: 'https://deploy-preview-40--tentman.netlify.app'
			});
			return;
		}

		throw new Error('Expected login route to redirect');
	});

	it('backs off before contacting GitHub when auth was just started', async () => {
		vi.mocked(isGitHubOAuthConfigured).mockReturnValue(true);
		vi.mocked(hasRecentGitHubLoginAttempt).mockReturnValue(true);

		await expect(
			GET({
				url: new URL('http://localhost/auth/login?redirect=/pages'),
				cookies: {
					get: vi.fn(() => '1'),
					set: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/?github_oauth=retry_later'
		});
	});
});
