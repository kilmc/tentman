import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/pages/[page]/[itemId]/edit/+page', () => {
	it('preserves the current route query when redirecting unauthenticated users to login', async () => {
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
				url: new URL('http://localhost/pages/posts/hello-world/edit?view=full'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages%2Fposts%2Fhello-world%2Fedit%3Fview%3Dfull'
		});
	});

	it('loads the item edit bootstrap from the thin API', async () => {
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
				url: new URL('http://localhost/pages/posts/hello-world/edit'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			itemId: 'hello-world',
			pageSlug: 'posts'
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/item-view?slug=posts&itemId=hello-world');
	});

	it('returns workflow editor state for draft-backed item editing without exposing the branch', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'posts' },
						item: { title: 'Draft hello world' },
						itemId: 'hello-world',
						pageSlug: 'posts',
						branch: 'preview-2026-04-06',
						workflowData: {
							editor: {
								status: 'draft',
								isDraft: true,
								recoveryContextKey: 'editor:dataset:def456',
								message: 'Changes will continue in the current draft.'
							}
						},
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

		const result = await load({
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
			url: new URL('http://localhost/pages/posts/hello-world/edit'),
			depends: () => {}
		} as never);

		expect(result).toMatchObject({
			editor: {
				status: 'draft',
				isDraft: true,
				recoveryContextKey: 'editor:dataset:def456'
			}
		});
		expect(JSON.stringify(result)).not.toContain('branch');
		expect(JSON.stringify(result)).not.toContain('preview-2026-04-06');

		expect(fetch).toHaveBeenCalledWith('/api/repo/item-view?slug=posts&itemId=hello-world');
	});
});
