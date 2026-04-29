import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/pages/[page]/[itemId]/preview-changes/+page', () => {
	it('preserves preview query params when redirecting unauthenticated users to login', async () => {
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
				url: new URL(
					'http://localhost/pages/posts/hello-world/preview-changes?data=abc&branch=preview-2026-04-06'
				),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location:
				'/repos?returnTo=%2Fpages%2Fposts%2Fhello-world%2Fpreview-changes%3Fdata%3Dabc%26branch%3Dpreview-2026-04-06'
		});
	});

	it('redirects to the new-item form in local mode', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
					selectedRepo: null,
					selectedBackend: {
						kind: 'local',
						repo: {
							name: 'Docs',
							pathLabel: '~/Sites/docs'
						}
					}
				}),
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				url: new URL('http://localhost/pages/posts/hello-world/preview-changes?new=true&data=abc'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages/posts/new'
		});
	});

	it('preserves the explicit branch when redirecting new-item previews back to the form', async () => {
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
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				url: new URL(
					'http://localhost/pages/posts/hello-world/preview-changes?new=true&branch=preview-2026-04-06'
				),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages/posts/new?branch=preview-2026-04-06'
		});
	});

	it('loads the item preview bootstrap from the thin API', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'posts' },
						contentData: { title: 'Hello world' },
						itemId: 'hello-world',
						isNew: true,
						filename: null,
						newFilename: 'hello-world',
						repo: { owner: 'acme', name: 'docs' }
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
				url: new URL(
					'http://localhost/pages/posts/hello-world/preview-changes?new=true&data=abc&newFilename=hello-world'
				),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			itemId: 'hello-world',
			isNew: true
		});

		expect(fetch).toHaveBeenCalledWith(
			'/api/repo/item-preview?slug=posts&itemId=hello-world&data=abc&new=true&newFilename=hello-world'
		);
	});

	it('returns the explicit branch so preview routes can round-trip draft item context', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'posts' },
						contentData: { title: 'Hello world' },
						itemId: 'hello-world',
						isNew: false,
						filename: 'hello-world.md',
						newFilename: null,
						repo: { owner: 'acme', name: 'docs' }
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
				url: new URL(
					'http://localhost/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md&branch=preview-2026-04-06'
				),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			branch: 'preview-2026-04-06'
		});
	});
});
