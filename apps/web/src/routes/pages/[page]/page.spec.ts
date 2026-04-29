import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

describe('routes/pages/[page]/+page', () => {
	it('preserves the explicit draft branch when redirecting unauthenticated users to login', async () => {
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
				url: new URL('http://localhost/pages/about?branch=preview-2026-04-06'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fabout%3Fbranch%3Dpreview-2026-04-06'
		});
	});

	it('passes through an explicit draft branch for singleton page reads', async () => {
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
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				fetch,
				params: {
					page: 'about'
				},
				url: new URL('http://localhost/pages/about?branch=preview-2026-04-06'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			branch: 'preview-2026-04-06'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/page-view?slug=about&branch=preview-2026-04-06');
	});

	it('keeps collection routes on the explicit collection landing page', async () => {
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
				fetch: async () =>
					new Response(
						JSON.stringify({
							discoveredConfig: {
								slug: 'posts',
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
							},
							content: [
								{ slug: 'hello-world', title: 'Hello world' },
								{ slug: 'second-post', title: 'Second post' }
							],
							contentError: null,
							pageSlug: 'posts',
							mode: 'github'
						}),
						{
							status: 200,
							headers: {
								'content-type': 'application/json'
							}
						}
					),
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
					},
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				}),
				fetch: async () => new Response(null, { status: 401 }),
				params: {
					page: 'about'
				},
				url: new URL('http://localhost/pages/about?branch=preview-2026-04-06'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fabout%3Fbranch%3Dpreview-2026-04-06'
		});
	});
});
