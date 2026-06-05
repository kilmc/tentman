import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

describe('routes/pages/[page]/+page', () => {
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
				url: new URL('http://localhost/pages/about?saved=true'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fabout%3Fsaved%3Dtrue'
		});
	});

	it('lets the server choose the managed draft branch for singleton page reads', async () => {
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
						content: {
							title: 'Draft About'
						},
						branch: 'preview-2026-04-06',
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
					},
					configs: [],
					blockConfigs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				fetch,
				params: {
					page: 'about'
				},
				url: new URL('http://localhost/pages/about'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			branch: 'preview-2026-04-06'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/page-view?slug=about');
	});

	it('keeps collection routes on the explicit collection landing page', async () => {
		const fetch = vi.fn();

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
					},
					configs: [
						{
							slug: 'posts',
							path: 'tentman/configs/posts.tentman.json',
							config: {
								id: 'posts',
								label: 'Posts',
								collection: true,
								content: {
									mode: 'directory'
								},
								idField: 'slug',
								blocks: []
							}
						}
					],
					blockConfigs: [],
					activeDraftBranch: null,
					navigationManifest: {
						...EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
						manifest: {
							version: 1,
							content: {
								items: ['posts']
							},
							collections: {
								posts: {
									items: ['second-post', 'hello-world'],
									groups: []
								}
							}
						}
					}
				}),
				fetch,
				params: {
					page: 'posts'
				},
				url: new URL('http://localhost/pages/posts'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			pageSlug: 'posts',
			mode: 'github'
		});
		expect(fetch).not.toHaveBeenCalledWith('/api/repo/page-view?slug=posts');
	});

	it('preserves the current route query when the thin API returns 401', async () => {
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
					},
					configs: [],
					blockConfigs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				fetch: async () => new Response(null, { status: 401 }),
				params: {
					page: 'about'
				},
				url: new URL('http://localhost/pages/about?saved=true'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fabout%3Fsaved%3Dtrue'
		});
	});
});
