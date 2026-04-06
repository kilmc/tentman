import { describe, expect, it } from 'vitest';
import { load } from './+layout';

describe('routes/pages/+layout', () => {
	it('returns empty configs when the GitHub bootstrap is not yet available', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: null
				})
			} as never)
		).toEqual({
			configs: []
		});
	});

	it('loads repo configs from the thin API bootstrap', async () => {
		expect(
			await load({
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
				depends: () => {},
				fetch: async () =>
					new Response(
						JSON.stringify({
							configs: [
								{
									slug: 'posts',
									path: 'content/posts.tentman.json',
									config: {
										label: 'Posts',
										collection: true,
										content: {
											mode: 'directory'
										},
										blocks: []
									}
								}
							]
						}),
						{
							status: 200,
							headers: {
								'content-type': 'application/json'
							}
						}
					)
			} as never)
		).toEqual({
			configs: [
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory'
						},
						blocks: []
					}
				}
			]
		});
	});

	it('redirects to login when repo config bootstrap returns 401', async () => {
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
				depends: () => {},
				fetch: async () => new Response(null, { status: 401 })
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?redirect=/pages'
		});
	});
});
