import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loadRepoConfigsBootstrap: vi.fn()
}));

vi.mock('$lib/repository/config-bootstrap', async () => {
	const actual = await vi.importActual<typeof import('$lib/repository/config-bootstrap')>(
		'$lib/repository/config-bootstrap'
	);

	return {
		...actual,
		loadRepoConfigsBootstrap: mocks.loadRepoConfigsBootstrap
	};
});

import { load } from './+layout';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

const emptyInstructionDiscovery = {
	instructions: [],
	issues: []
};

describe('routes/pages/+layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadRepoConfigsBootstrap.mockResolvedValue({
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
			blockConfigs: [],
			rootConfig: null,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
		});
	});

	it('returns empty configs when the GitHub bootstrap is not yet available', async () => {
		expect(
			await load({
				parent: async () => ({
					isAuthenticated: false
				}),
				fetch: vi.fn()
			} as never)
		).toEqual({
			...EMPTY_REPO_CONFIGS_BOOTSTRAP,
			instructionDiscovery: emptyInstructionDiscovery
		});
	});

	it('loads repo configs through the thin repo configs endpoint for GitHub mode', async () => {
		const fetcher = vi.fn();

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
				fetch: fetcher
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
			],
			blockConfigs: [],
			rootConfig: null,
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest,
			instructionDiscovery: emptyInstructionDiscovery
		});
		expect(mocks.loadRepoConfigsBootstrap).toHaveBeenCalledWith(fetcher);
	});

	it('returns empty configs when local mode is active, even if a stale GitHub repo snapshot exists', async () => {
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
						kind: 'local',
						repo: {
							name: 'Docs',
							pathLabel: '~/Sites/docs'
						}
					}
				}),
				fetch: vi.fn()
			} as never)
		).toEqual({
			...EMPTY_REPO_CONFIGS_BOOTSTRAP,
			instructionDiscovery: emptyInstructionDiscovery
		});
	});

	it('redirects to login when repo config bootstrap returns 401', async () => {
		mocks.loadRepoConfigsBootstrap.mockRejectedValueOnce({
			status: 401
		});

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
				fetch: vi.fn()
			} as never)
		).rejects.toMatchObject({
			status: 302,
			location: '/repos?returnTo=%2Fpages'
		});
	});
});
