import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/pages/[page]/[itemId]/+page', () => {
	it('preserves the explicit draft branch when redirecting unauthenticated users to login', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null
				}),
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				url: new URL('http://localhost/pages/posts/hello-world?branch=preview-2026-04-06'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fposts%2Fhello-world%3Fbranch%3Dpreview-2026-04-06'
		});
	});

	it('loads the item bootstrap from the thin API', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'posts' },
						item: { title: 'Hello world' },
						itemId: 'hello-world',
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
					page: 'posts',
					itemId: 'hello-world'
				},
				url: new URL('http://localhost/pages/posts/hello-world'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			itemId: 'hello-world',
			pageSlug: 'posts'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/item-view?slug=posts&itemId=hello-world');
	});

	it('passes through an explicit draft branch when present in the route URL', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'posts' },
						item: { title: 'Draft hello world' },
						itemId: 'hello-world',
						pageSlug: 'posts',
						branch: 'preview-2026-04-06',
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
					page: 'posts',
					itemId: 'hello-world'
				},
				url: new URL('http://localhost/pages/posts/hello-world?branch=preview-2026-04-06'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			branch: 'preview-2026-04-06'
		});

		expect(fetch).toHaveBeenCalledWith(
			'/api/repo/item-view?slug=posts&itemId=hello-world&branch=preview-2026-04-06'
		);
	});

	it('preserves the explicit draft branch when the thin API returns 401', async () => {
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
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				url: new URL('http://localhost/pages/posts/hello-world?branch=preview-2026-04-06'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fposts%2Fhello-world%3Fbranch%3Dpreview-2026-04-06'
		});
	});
});
