import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getTentmanDraftBranchName: vi.fn()
}));

vi.mock('$lib/utils/draft-comparison', () => ({
	compareDraftToBranch: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getDraftChangeIndex: vi.fn()
}));

import { POST } from './+server';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { requireGitHubRepository } from '$lib/server/page-context';
import { getDraftChangeIndex } from '$lib/server/repository-data';
import { EMPTY_REPO_CONFIGS_BOOTSTRAP } from '$lib/repository/config-bootstrap';

function createRequest(body: unknown) {
	return {
		request: {
			json: async () => body
		},
		locals: {},
		cookies: {
			delete: vi.fn()
		}
	};
}

describe('POST /api/repo/pages-summary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			defaultBranch: 'main'
		} as never);
	});

	it('rejects invalid summary requests', async () => {
		await expect(POST(createRequest({ configs: [] }) as never)).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Invalid pages summary request'
			}
		});
	});

	it('returns an empty summary when there are no configs', async () => {
		const response = await POST(
			createRequest({
				configs: [],
				navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
			}) as never
		);

		expect(await response.json()).toEqual({
			draftBranch: null,
			changedPages: [],
			totalChanges: 0,
			hasConfigs: false
		});
		expect(requireGitHubRepository).not.toHaveBeenCalled();
	});

	it('returns an empty has-configs summary when there is no draft branch', async () => {
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue(undefined);

		const response = await POST(
			createRequest({
				configs: [
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							id: 'posts',
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
			}) as never
		);

		expect(await response.json()).toEqual({
			draftBranch: null,
			changedPages: [],
			totalChanges: 0,
			hasConfigs: true
		});
	});

	it('summarizes changed pages for the overview screen', async () => {
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');
		vi.mocked(getDraftChangeIndex).mockResolvedValue({
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			metadata: {
				branchExists: true
			},
			files: [],
			byConfigSlug: new Map([
				[
					'about',
					{
						slug: 'about',
						modified: [],
						created: [],
						deleted: [],
						requiresFullFetch: false
					}
				],
				[
					'posts',
					{
						slug: 'posts',
						modified: ['hello-world'],
						created: ['second-post'],
						deleted: [],
						requiresFullFetch: false
					}
				]
			])
		});

		const response = await POST(
			createRequest({
				configs: [
					{
						slug: 'about',
						path: 'content/about.tentman.json',
						config: {
							id: 'about',
							label: 'About Page',
							collection: false,
							content: {
								mode: 'file'
							},
							blocks: []
						}
					},
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							id: 'posts',
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
			}) as never
		);

		expect(await response.json()).toEqual({
			draftBranch: 'tentman-preview',
			changedPages: [
				{
					slug: 'posts',
					label: 'Posts',
					changeCount: 2,
					isCollection: true
				}
			],
			totalChanges: 2,
			hasConfigs: true
		});
		expect(compareDraftToBranch).not.toHaveBeenCalled();
	});

	it('falls back to full comparison for ambiguous indexed changes', async () => {
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');
		vi.mocked(getDraftChangeIndex).mockResolvedValue({
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			metadata: {
				branchExists: true
			},
			files: [],
			byConfigSlug: new Map([
				[
					'posts',
					{
						slug: 'posts',
						modified: [],
						created: [],
						deleted: [],
						requiresFullFetch: true
					}
				]
			])
		});
		vi.mocked(compareDraftToBranch).mockResolvedValue({
			modified: [{ itemId: 'hello-world' }],
			created: [],
			deleted: [{ itemId: 'old-post' }]
		});

		const response = await POST(
			createRequest({
				configs: [
					{
						slug: 'posts',
						path: 'content/posts.tentman.json',
						config: {
							id: 'posts',
							label: 'Posts',
							collection: true,
							content: {
								mode: 'file'
							},
							blocks: []
						}
					}
				],
				navigationManifest: EMPTY_REPO_CONFIGS_BOOTSTRAP.navigationManifest
			}) as never
		);

		expect(await response.json()).toEqual({
			draftBranch: 'tentman-preview',
			changedPages: [
				{
					slug: 'posts',
					label: 'Posts',
					changeCount: 2,
					isCollection: true
				}
			],
			totalChanges: 2,
			hasConfigs: true
		});
		expect(compareDraftToBranch).toHaveBeenCalledTimes(1);
	});
});
