import { describe, expect, it } from 'vitest';
import { load } from './+page';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

describe('routes/pages/+page', () => {
	it('redirects GitHub-backed /pages requests to the first config', async () => {
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
					],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				})
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/pages/posts'
		});
	});

	it('keeps local mode on the client path', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false,
					selectedRepo: null,
					selectedBackend: {
						kind: 'local',
						repo: {
							name: 'Docs',
							pathLabel: '~/Sites/docs'
						}
					},
					configs: [],
					navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
				})
			} as never)
		).toEqual({});
	});
});
