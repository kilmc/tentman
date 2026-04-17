import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getLatestPreviewBranchName: vi.fn()
}));

vi.mock('$lib/utils/draft-comparison', () => ({
	compareDraftToBranch: vi.fn()
}));

import { POST } from './+server';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { requireGitHubRepository } from '$lib/server/page-context';
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
			name: 'docs'
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
		vi.mocked(getLatestPreviewBranchName).mockResolvedValue(undefined);

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
		vi.mocked(getLatestPreviewBranchName).mockResolvedValue('preview-2026-04-06');
		vi.mocked(compareDraftToBranch)
			.mockResolvedValueOnce({
				modified: [],
				created: [],
				deleted: []
			})
			.mockResolvedValueOnce({
				modified: [{ itemId: 'hello-world' }],
				created: [{ itemId: 'second-post' }],
				deleted: []
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
			draftBranch: 'preview-2026-04-06',
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
	});
});
