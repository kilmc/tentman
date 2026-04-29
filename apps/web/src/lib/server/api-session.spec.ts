import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', () => ({
	isGitHubOAuthConfigured: vi.fn(() => true)
}));

import { GET } from '../../routes/api/session/+server';

describe('GET /api/session', () => {
	it('returns the session snapshot from locals without calling GitHub', async () => {
		const response = await GET({
			locals: {
				isAuthenticated: true,
				user: {
					login: 'kilmc',
					name: 'Kilian',
					avatar_url: 'https://avatars.example/kilmc',
					email: 'kilian@example.com'
				},
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				},
				selectedBackend: {
					kind: 'github',
					repo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs'
					}
				},
				rootConfig: {
					siteName: 'Acme Docs'
				}
			}
		} as never);

		expect(await response.json()).toEqual({
			isAuthenticated: true,
			githubOAuthConfigured: true,
			user: {
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			},
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			},
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			rootConfig: {
				siteName: 'Acme Docs'
			},
			recentRepos: []
		});
	});
});
