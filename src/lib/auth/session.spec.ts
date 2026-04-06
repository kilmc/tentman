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
					})
				)
		);

		expect(await loadSessionBootstrap(fetcher as typeof fetch)).toEqual({
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
		});
		expect(fetcher).toHaveBeenCalledWith('/api/session');
	});
});
