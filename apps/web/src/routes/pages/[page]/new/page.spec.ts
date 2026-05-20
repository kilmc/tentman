import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/pages/[page]/new/+page', () => {
	it('preserves the current route query when redirecting unauthenticated users to login', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null
				}),
				params: {
					page: 'posts'
				},
				url: new URL('http://localhost/pages/posts/new?template=blank'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fposts%2Fnew%3Ftemplate%3Dblank'
		});
	});

	it('loads new-item draft setup without threading a branch through the route', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: {
							slug: 'posts',
							config: {
								collection: true
							}
						},
						blockConfigs: [],
						packageBlocks: [],
						blockRegistryError: null,
						pageSlug: 'posts',
						mode: 'github'
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
				params: {
					page: 'posts'
				},
				url: new URL('http://localhost/pages/posts/new'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			pageSlug: 'posts'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/form-config?slug=posts');
	});
});
