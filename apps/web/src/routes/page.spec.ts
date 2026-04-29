import { describe, expect, it } from 'vitest';
import { load } from './+page';

describe('routes/+page', () => {
	it('redirects to /pages when a site is already selected', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
					selectedBackend: {
						kind: 'github',
						repo: {
							owner: 'acme',
							name: 'docs',
							full_name: 'acme/docs'
						}
					}
				})
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages'
		});
	});

	it('redirects authenticated users without a selected site to /repos', async () => {
		await expect(
			load({
				parent: async () => ({
					isAuthenticated: true,
					selectedBackend: null
				})
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos'
		});
	});

	it('keeps the root splash page available for anonymous users', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false,
					selectedBackend: null
				})
			} as never)
		).toEqual({});
	});
});
