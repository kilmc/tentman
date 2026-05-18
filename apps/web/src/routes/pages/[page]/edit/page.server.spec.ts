import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	saveContentDocument: vi.fn()
}));

vi.mock('$lib/features/draft-assets/server', () => ({
	materializeDraftAssetsFromFormData: vi.fn(async ({ content }) => ({ content }))
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	ensureDraftBranch: vi.fn(async () => ({ branchName: 'tentman-preview', created: false }))
}));

vi.mock('$lib/github/pull-request', () => ({
	ensureDraftPullRequest: vi.fn()
}));

import { actions } from './+page.server';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

function createRequest(form: Record<string, string>) {
	return {
		formData: async () => {
			const data = new FormData();
			for (const [key, value] of Object.entries(form)) {
				data.set(key, value);
			}
			return data;
		}
	};
}

describe('routes/pages/[page]/edit/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves the explicit branch when redirecting to page preview changes', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'about',
				config: {},
				path: 'content/about.tentman.json'
			}
		} as never);

		await expect(
			actions.saveToPreview({
				locals: {},
				params: {
					page: 'about'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'About' }),
					branch: 'preview-2026-04-06'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/about/edit?saved=true&branch=tentman-preview'
		});
	});

	it('preserves the current route query when auth expires during save-to-preview', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.saveToPreview({
			locals: {},
			params: {
				page: 'about'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'About' }),
				branch: 'preview-2026-04-06'
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/about/edit?branch=preview-2026-04-06')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/about/edit?branch=preview-2026-04-06'
		);
	});
});
