import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	previewContentChanges: vi.fn()
}));

import { GET } from '../../routes/api/repo/page-preview/+server';
import { previewContentChanges } from '$lib/content/service';
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
	slug: 'about',
	path: 'content/about.tentman.json',
	config: {
		label: 'About',
		collection: false,
		content: {
			mode: 'file'
		},
		blocks: []
	}
} as const;

describe('GET /api/repo/page-preview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the single-entry preview bootstrap payload', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			owner: 'acme',
			name: 'docs',
			discoveredConfig
		} as never);
		vi.mocked(previewContentChanges).mockResolvedValue({
			totalChanges: 1,
			files: [
				{
					type: 'update',
					path: 'content/about.md'
				}
			]
		} as never);

		const encodedData = Buffer.from(JSON.stringify({ title: 'Hello world' })).toString('base64url');
		const response = await GET({
			url: new URL(`http://localhost/api/repo/page-preview?slug=about&data=${encodedData}`),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'about'
			},
			contentData: {
				title: 'Hello world'
			},
			changesSummary: {
				totalChanges: 1
			},
			changesError: null,
			repo: {
				owner: 'acme',
				name: 'docs'
			}
		});
	});

	it('clears the session and returns 401 on GitHub auth failure', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/page-preview?slug=about&data=abc'),
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
