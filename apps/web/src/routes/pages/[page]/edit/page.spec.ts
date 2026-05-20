import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/pages/[page]/edit/+page', () => {
	it('preserves the current route query when redirecting unauthenticated users to login', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null
				}),
				params: {
					page: 'about'
				},
				url: new URL('http://localhost/pages/about/edit?view=full'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fabout%2Fedit%3Fview%3Dfull'
		});
	});

	it('loads the singleton edit bootstrap from the thin API', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: {
							slug: 'about',
							config: {
								collection: false
							}
						},
						content: { title: 'About' },
						pageSlug: 'about',
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
					page: 'about'
				},
				url: new URL('http://localhost/pages/about/edit'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			pageSlug: 'about'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/page-view?slug=about');
	});

	it('lets the server choose the managed draft branch for singleton draft editing', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: {
							slug: 'about',
							config: {
								collection: false
							}
						},
						content: { title: 'Draft About' },
						branch: 'tentman-preview',
						pageSlug: 'about',
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
					page: 'about'
				},
				url: new URL('http://localhost/pages/about/edit'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			branch: 'tentman-preview'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/page-view?slug=about');
	});
});
