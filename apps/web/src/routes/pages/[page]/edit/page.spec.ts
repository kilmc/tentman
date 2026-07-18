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

	it('returns workflow editor state for singleton draft editing without exposing the branch', async () => {
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
						workflowData: {
							editor: {
								status: 'draft',
								isDraft: true,
								recoveryContextKey: 'editor:dataset:abc123',
								message: 'Changes will continue in the current draft.'
							}
						},
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
				page: 'about'
			},
			url: new URL('http://localhost/pages/about/edit'),
			depends: () => {}
		} as never);

		expect(result).toMatchObject({
			editor: {
				status: 'draft',
				isDraft: true,
				recoveryContextKey: 'editor:dataset:abc123'
			}
		});
		expect(JSON.stringify(result)).not.toContain('branch');
		expect(JSON.stringify(result)).not.toContain('tentman-preview');

		expect(fetch).toHaveBeenCalledWith('/api/repo/page-view?slug=about');
	});
});
