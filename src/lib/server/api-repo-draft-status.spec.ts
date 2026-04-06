import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getLatestPreviewBranchName: vi.fn()
}));

vi.mock('$lib/utils/draft-comparison', () => ({
	compareDraftToBranch: vi.fn()
}));

import { GET } from '../../routes/api/repo/draft-status/+server';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { requireDiscoveredConfig } from '$lib/server/page-context';
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
			discoveredConfig
		} as never);
		vi.mocked(getLatestPreviewBranchName).mockResolvedValue('preview-2026-04-06');
		vi.mocked(compareDraftToBranch).mockResolvedValue({
			modified: [],
			created: [{ itemId: 'hello-world' }],
			deleted: []
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/draft-status?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toEqual({
			draftBranch: 'preview-2026-04-06',
			draftChanges: {
				modified: [],
				created: [{ itemId: 'hello-world' }],
				deleted: []
			}
		});
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
