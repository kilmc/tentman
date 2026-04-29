import { describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

vi.mock('$lib/server/auth/github', () => ({
	clearGitHubOAuthRequest: vi.fn(),
	getGitHubOAuthCredentials: vi.fn(() => ({
		clientId: 'github-client-id',
		clientSecret: 'github-client-secret'
	})),
	persistGitHubSession: vi.fn(),
	readGitHubOAuthRequest: vi.fn(() => ({
		state: 'oauth-state-token',
		redirectTo: '/repos'
	}))
}));

import { GET } from './+server';
import {
	clearGitHubOAuthRequest,
	persistGitHubSession,
	readGitHubOAuthRequest
} from '$lib/server/auth/github';

describe('routes/auth/callback/+server', () => {
	it('redirects to the stored destination after a successful login', async () => {
		mockFetch.mockReset();
		mockFetch
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						access_token: 'secret-token'
					}),
					{
						headers: {
							'Content-Type': 'application/json'
						}
					}
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						login: 'kilmc',
						name: 'Kilian',
						avatar_url: 'https://avatars.example/kilmc',
						email: 'kilian@example.com'
					}),
					{
						headers: {
							'Content-Type': 'application/json'
						}
					}
				)
			);

		try {
			await GET({
				url: new URL('http://localhost/auth/callback?code=abc123&state=oauth-state-token'),
				cookies: {
					get: vi.fn(),
					set: vi.fn(),
					delete: vi.fn()
				}
			} as never);
		} catch (error) {
			expect(readGitHubOAuthRequest).toHaveBeenCalled();
			expect(persistGitHubSession).toHaveBeenCalledWith(
				expect.objectContaining({
					set: expect.any(Function)
				}),
				{
					token: 'secret-token',
					user: {
						login: 'kilmc',
						name: 'Kilian',
						avatar_url: 'https://avatars.example/kilmc',
						email: 'kilian@example.com'
					}
				}
			);
			expect(error).toMatchObject({
				status: 302,
				location: '/repos'
			});
			expect(clearGitHubOAuthRequest).toHaveBeenCalled();
			return;
		}

		throw new Error('Expected callback route to redirect');
	});

	it('rejects callbacks with a mismatched oauth state', async () => {
		await expect(
			GET({
				url: new URL('http://localhost/auth/callback?code=abc123&state=wrong-state'),
				cookies: {
					get: vi.fn(),
					set: vi.fn(),
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 400
		});

		expect(clearGitHubOAuthRequest).toHaveBeenCalled();
	});
});
