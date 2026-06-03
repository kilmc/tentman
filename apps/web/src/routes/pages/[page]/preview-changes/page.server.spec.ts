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
	ensureDraftBranch: vi.fn(async () => ({ branchName: 'tentman-preview', created: false })),
	publishDraftBranch: vi.fn(async () => ({ branchName: 'tentman-preview' }))
}));

vi.mock('$lib/github/pull-request', () => ({
	ensureDraftPullRequest: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	invalidateContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn()
}));

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	invalidateNavigationManifestStateCache: vi.fn()
}));

import { actions } from './+page.server';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import { invalidateRepositoryData } from '$lib/server/repository-data';
import { invalidateContent } from '$lib/stores/content-cache';

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

describe('routes/pages/[page]/preview-changes/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('saves singleton draft changes and returns to the editor with a saved flag', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'about',
				config: {
					blocks: []
				},
				path: 'content/about.tentman.json'
			}
		} as never);

		await expect(
			actions.createPreview({
				locals: {},
				params: {
					page: 'about'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'About' })
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/about/edit?saved=true'
		});
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: 'tentman-preview',
			reason: 'content-write'
		});
	});

	it('publishes singleton draft changes directly from the preview screen', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'about',
				config: {
					blocks: []
				},
				path: 'content/about.tentman.json'
			}
		} as never);

		await expect(
			actions.publishNow({
				locals: {},
				params: {
					page: 'about'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'About' })
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/about/edit?published=true'
		});

		expect(invalidateContent).toHaveBeenCalledWith('github:acme/docs');
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: undefined,
			reason: 'publish'
		});
	});

	it('preserves preview query params when auth expires during singleton draft save', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.createPreview({
			locals: {},
			params: {
				page: 'about'
			},
			request: {
				formData: async () => new FormData()
			},
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/about/preview-changes?data=abc&filename=about.md')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/about/preview-changes?data=abc&filename=about.md'
		);
	});

	it('preserves preview query params when auth expires during singleton publish-now', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.publishNow({
			locals: {},
			params: {
				page: 'about'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'About' })
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/about/preview-changes?data=abc&filename=about.md')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/about/preview-changes?data=abc&filename=about.md'
		);
	});
});
