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
					'http://localhost/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md'
				),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location:
				'/repos?returnTo=%2Fpages%2Fposts%2Fhello-world%2Fpreview-changes%3Fdata%3Dabc%26filename%3Dhello-world.md'
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

	it('redirects new-item previews back to the form without preserving a branch query', async () => {
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
				url: new URL('http://localhost/pages/posts/hello-world/preview-changes?new=true'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages/posts/new'
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

	it('loads preview routes without round-tripping draft branch query params', async () => {
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
					'http://localhost/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md'
				),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			itemId: 'hello-world',
			filename: 'hello-world.md'
		});
	});
});
