import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('routes/pages/[page]/preview-changes/+page', () => {
	it('preserves preview query params when redirecting unauthenticated users to login', async () => {
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
				url: new URL(
					'http://localhost/pages/about/preview-changes?data=abc&branch=preview-2026-04-06'
				),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location:
				'/repos?returnTo=%2Fpages%2Fabout%2Fpreview-changes%3Fdata%3Dabc%26branch%3Dpreview-2026-04-06'
		});
	});

	it('redirects to edit when preview data is missing', async () => {
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
					page: 'about'
				},
				url: new URL('http://localhost/pages/about/preview-changes'),
				depends: () => {}
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages/about/edit'
		});
	});

	it('loads the preview bootstrap from the thin API', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'about' },
						contentData: { title: 'About' },
						changesSummary: { totalChanges: 1, files: [] },
						changesError: null,
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
					page: 'about'
				},
				url: new URL('http://localhost/pages/about/preview-changes?data=abc'),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			discoveredConfig: {
				slug: 'about'
			},
			contentData: {
				title: 'About'
			}
		});

		expect(fetch).toHaveBeenCalledWith('/api/repo/page-preview?slug=about&data=abc');
	});

	it('returns the explicit branch so singleton preview can round-trip draft context', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						discoveredConfig: { slug: 'about' },
						contentData: { title: 'About' },
						changesSummary: { totalChanges: 1, files: [] },
						changesError: null,
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
					page: 'about'
				},
				url: new URL(
					'http://localhost/pages/about/preview-changes?data=abc&branch=preview-2026-04-06'
				),
				depends: () => {}
			} as never)
		).resolves.toMatchObject({
			branch: 'preview-2026-04-06'
		});
	});
});
