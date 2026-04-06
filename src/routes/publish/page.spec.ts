import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/publish/+page', () => {
	it('redirects unauthenticated users to login', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null
				})
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?redirect=/publish'
		});
	});

	it('loads publish review data from the thin API', async () => {
		const fetch = vi.fn(async () =>
			new Response(
				JSON.stringify({
					draftBranch: { name: 'preview-2026-04-05' },
					configsWithChanges: [],
					commits: []
				}),
				{
					status: 200,
					headers: {
						'content-type': 'application/json'
					}
				}
			)
		);

		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
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
					}
				}),
				fetch,
				depends: () => {}
			} as never)
		).resolves.toEqual({
			draftBranch: { name: 'preview-2026-04-05' },
			configsWithChanges: [],
			commits: []
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/publish-view');
	});

	it('redirects to login when the thin API reports an expired session', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
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
					}
				}),
				fetch: async () => new Response(null, { status: 401 }),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?redirect=/publish'
		});
	});
});
