import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	createContentDocument: vi.fn()
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

describe('routes/pages/[page]/new/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves the explicit branch when redirecting to new-item preview changes', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				path: 'content/posts.tentman.json',
				config: {
					idField: 'slug',
					content: {
						mode: 'directory'
					}
				}
			}
		} as never);

		await expect(
			actions.createToPreview({
				locals: {},
				params: {
					page: 'posts'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world', slug: 'hello-world' }),
					newFilename: 'hello-world',
					branch: 'preview-2026-04-06'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts/hello-world/edit?saved=true&branch=tentman-preview'
		});
	});

	it('preserves the current route query when auth expires during new-item preview setup', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.createToPreview({
			locals: {},
			params: {
				page: 'posts'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'Hello world' }),
				branch: 'preview-2026-04-06'
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/posts/new?branch=preview-2026-04-06')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/posts/new?branch=preview-2026-04-06'
		);
	});
});
