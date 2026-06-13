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

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn()
}));

import { actions } from './+page.server';
import { saveContentDocument } from '$lib/content/service';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import { invalidateRepositoryData } from '$lib/server/repository-data';

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

	it('redirects back to the editor after saving to the managed draft', async () => {
		vi.mocked(saveContentDocument).mockImplementation(async (backend) => {
			await backend.writeTextFile('content/about.md', 'updated');
		});
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null),
				commitChanges: vi.fn(async () => undefined)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'about',
				config: {
					label: 'About',
					blocks: []
				},
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
			changedPaths: ['content/about.md'],
			reason: 'content-write'
		});
	});

	it('batches multiple draft assets and content into one repository commit', async () => {
		const commitChanges = vi.fn(async () => undefined);
		vi.mocked(materializeDraftAssetsFromFormData).mockImplementationOnce(
			async ({ backend, content }) => {
				await backend.writeBinaryFile('static/images/hero.png', new Uint8Array([1, 2, 3]));
				await backend.writeBinaryFile('static/images/gallery.png', new Uint8Array([4, 5, 6]));
				return {
					content: {
						...content,
						hero: '/images/hero.png',
						gallery: '/images/gallery.png'
					},
					fileChanges: [],
					cleanedRefs: ['draft-asset:hero', 'draft-asset:gallery']
				};
			}
		);
		vi.mocked(saveContentDocument).mockImplementation(async (backend, _config, _path, content) => {
			await backend.writeTextFile('content/about.md', JSON.stringify(content));
		});
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null),
				commitChanges
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'about',
				config: {
					label: 'About',
					blocks: []
				},
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
					data: JSON.stringify({
						title: 'About',
						hero: 'draft-asset:hero',
						gallery: 'draft-asset:gallery'
					})
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/about/edit?saved=true'
		});

		expect(commitChanges).toHaveBeenCalledTimes(1);
		expect(commitChanges).toHaveBeenCalledWith(
			[
				{
					type: 'writeBinary',
					path: 'static/images/hero.png',
					content: expect.any(Uint8Array)
				},
				{
					type: 'writeBinary',
					path: 'static/images/gallery.png',
					content: expect.any(Uint8Array)
				},
				{
					type: 'writeText',
					path: 'content/about.md',
					content: JSON.stringify({
						title: 'About',
						hero: '/images/hero.png',
						gallery: '/images/gallery.png'
					})
				}
			],
			{
				message: 'Update About via Tentman CMS',
				ref: 'tentman-preview'
			}
		);
	});

	it('preserves the current route query when auth expires during save-to-preview', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.saveToPreview({
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
			url: new URL('http://localhost/pages/about/edit?view=full')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/about/edit?view=full'
		);
	});
});
