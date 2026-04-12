import { describe, expect, it, vi } from 'vitest';
import {
	EMPTY_SESSION_BOOTSTRAP,
	loadSessionBootstrap,
	normalizeSessionBootstrap
} from './session';

describe('auth/session', () => {
	it('normalizes missing session fields to null-safe defaults', () => {
		expect(normalizeSessionBootstrap({ isAuthenticated: true })).toEqual({
			...EMPTY_SESSION_BOOTSTRAP,
			isAuthenticated: true
		});
	});

	it('loads the bootstrap payload from /api/session', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
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
						recentRepos: [
							{
								owner: 'acme',
								name: 'docs',
								full_name: 'acme/docs',
								openedAt: '2026-04-10T09:15:00.000Z'
							}
						]
					})
				)
		);

		expect(await loadSessionBootstrap(fetcher as typeof fetch)).toEqual({
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
			recentRepos: [
				{
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					openedAt: '2026-04-10T09:15:00.000Z'
				}
			]
		});
		expect(fetcher).toHaveBeenCalledWith('/api/session');
	});
});
