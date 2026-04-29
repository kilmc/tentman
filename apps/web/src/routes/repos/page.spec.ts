import { describe, expect, it } from 'vitest';
import { load } from './+page';

describe('routes/repos/+page', () => {
	it('keeps the repo picker available for local-only use when unauthenticated', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false,
					recentRepos: []
				})
			} as never)
		).resolves.toEqual({
			repos: [],
			recentRepos: [],
			githubAuthenticated: false
		});
	});

	it('loads repositories from the thin API', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: true,
					recentRepos: []
				}),
				depends: () => {},
				fetch: async () =>
					new Response(
						JSON.stringify({
							repos: [
								{
									id: 1,
									name: 'docs',
									full_name: 'acme/docs',
									owner: 'acme',
									description: 'Docs repo',
									private: false,
									updated_at: '2026-04-05T18:30:00.000Z'
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
			repos: [
				{
					id: 1,
					name: 'docs',
					full_name: 'acme/docs',
					owner: 'acme',
					description: 'Docs repo',
					private: false,
					updated_at: '2026-04-05T18:30:00.000Z'
				}
			],
			recentRepos: [],
			githubAuthenticated: true
		});
	});

	it('falls back to local-only mode when the thin API reports an expired session', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
					recentRepos: []
				}),
				depends: () => {},
				fetch: async () => new Response(null, { status: 401 })
			} as never)
		).resolves.toEqual({
			repos: [],
			recentRepos: [],
			githubAuthenticated: false
		});
	});
});
