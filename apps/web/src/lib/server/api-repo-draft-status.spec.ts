import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn()
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

import { GET } from '../../routes/api/repo/draft-status/+server';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { requireDiscoveredConfig } from '$lib/server/page-context';
import { getDraftChangeIndex } from '$lib/server/repository-data';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

const discoveredConfig = {
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
} as const;

describe('GET /api/repo/draft-status', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns draft status for a config slug', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			defaultBranch: 'main',
			discoveredConfig
		} as never);
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
						created: ['hello-world'],
						deleted: [],
						requiresFullFetch: false
					}
				]
			])
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/draft-status?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			draftBranch: 'tentman-preview',
			draftChanges: {
				modified: [],
				created: [{ itemId: 'hello-world' }],
				deleted: [],
				metadata: {
					branchExists: true
				}
			}
		});
		expect(compareDraftToBranch).not.toHaveBeenCalled();
	});

	it('falls back to full comparison when the draft index cannot cheaply answer', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			octokit: {},
			owner: 'acme',
			name: 'docs',
			defaultBranch: 'main',
			discoveredConfig
		} as never);
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
			deleted: []
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/draft-status?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			draftBranch: 'tentman-preview',
			draftChanges: {
				modified: [{ itemId: 'hello-world' }],
				created: [],
				deleted: []
			}
		});
		expect(compareDraftToBranch).toHaveBeenCalledTimes(1);
	});

	it('clears the session and returns 401 on GitHub auth failure', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/draft-status?slug=posts'),
				locals: {},
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
	});
});
