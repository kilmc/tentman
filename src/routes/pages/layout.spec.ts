import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loadSelectedGitHubRepoConfigs: vi.fn(),
	handleGitHubSessionError: vi.fn()
}));

vi.mock('$lib/server/repo-config-bootstrap', () => ({
	loadSelectedGitHubRepoConfigs: mocks.loadSelectedGitHubRepoConfigs
}));

vi.mock('$lib/server/auth/github', () => ({
	handleGitHubSessionError: mocks.handleGitHubSessionError
}));

import { load } from './+layout.server';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

describe('routes/pages/+layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadSelectedGitHubRepoConfigs.mockResolvedValue({
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
				locals: {
					isAuthenticated: false
				},
				cookies: {}
			} as never)
		).toEqual(EMPTY_REPO_CONFIGS_BOOTSTRAP);
	});

	it('loads repo configs from the current server-selected GitHub repo', async () => {
		expect(
			await load({
				locals: {
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
				},
				cookies: {
					delete: () => {}
				}
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
			navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
		});
	});

	it('returns empty configs when local mode is active, even if a stale GitHub repo snapshot exists', async () => {
		expect(
			await load({
				locals: {
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
				},
				cookies: {}
			} as never)
		).toEqual(EMPTY_REPO_CONFIGS_BOOTSTRAP);
	});

	it('redirects to login when repo config bootstrap returns 401', async () => {
		mocks.loadSelectedGitHubRepoConfigs.mockRejectedValueOnce({
			status: 401
		});

		await expect(
			load({
				locals: {
					isAuthenticated: true,
					githubToken: 'secret-token',
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
				},
				cookies: {
					delete: () => {}
				}
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(mocks.handleGitHubSessionError).toHaveBeenCalledOnce();
	});
});
