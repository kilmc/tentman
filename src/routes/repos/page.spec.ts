import { describe, expect, it } from 'vitest';
import { load } from './+page';

describe('routes/repos/+page', () => {
	it('redirects unauthenticated users to login', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: false
				})
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?redirect=/repos'
		});
	});

	it('loads repositories from the thin API', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: true
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
			]
		});
	});

	it('redirects to login when the thin API reports an expired session', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true
				}),
				depends: () => {},
				fetch: async () => new Response(null, { status: 401 })
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?redirect=/repos'
		});
	});
});
