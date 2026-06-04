import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	deleteContentDocument: vi.fn(),
	saveContentDocument: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn(),
	resolveCollectionItemDocument: vi.fn(async () => null)
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

vi.mock('$lib/features/content-management/navigation-manifest', async () => {
	const actual = await vi.importActual<object>(
		'$lib/features/content-management/navigation-manifest'
	);
	return {
		...actual,
		syncCollectionItemGroupSelection: vi.fn()
	};
});

import { actions } from './+page.server';
import { deleteContentDocument, saveContentDocument } from '$lib/content/service';
import { invalidateRepositoryData, resolveCollectionItemDocument } from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

const collectionConfig = {
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

const fileCollectionConfig = {
	...collectionConfig,
	config: {
		...collectionConfig.config,
		content: {
			mode: 'file'
		}
	}
} as const;

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

describe('routes/pages/[page]/[itemId]/edit/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue(null);
	});

	it('redirects back to the item editor after saving to the managed draft', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);

		await expect(
			actions.saveToPreview({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world' }),
					filename: 'hello-world.md'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts/hello-world/edit?saved=true'
		});
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({
				readRootConfig: expect.any(Function)
			}),
			ref: 'tentman-preview',
			reason: 'content-write'
		});
	});

	it('saves a directory-backed draft item using the repository-data resolver filename', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue({
			config: collectionConfig,
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'blob-hello-world',
				title: 'Hello world',
				sortDate: null
			},
			content: {
				title: 'Hello world'
			}
		} as never);

		await expect(
			actions.saveToPreview({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world updated' })
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts/hello-world/edit?saved=true'
		});

		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			slug: 'posts',
			itemId: 'hello-world',
			ref: undefined
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(saveContentDocument).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			collectionConfig.config,
			collectionConfig.path,
			{ title: 'Hello world updated' },
			{
				branch: 'tentman-preview',
				filename: 'hello-world.md'
			}
		);
	});

	it('falls back to full draft content when saving and the repository-data resolver cannot answer', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'local:docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		await expect(
			actions.saveToPreview({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world updated' })
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts/hello-world/edit?saved=true'
		});

		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'local:docs' }),
			slug: 'posts',
			itemId: 'hello-world',
			ref: undefined
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'local:docs' }),
			collectionConfig.config,
			collectionConfig.path,
			'posts',
			undefined
		);
		expect(saveContentDocument).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'local:docs' }),
			collectionConfig.config,
			collectionConfig.path,
			{ title: 'Hello world updated' },
			{
				branch: 'tentman-preview',
				filename: 'hello-world.md'
			}
		);
	});

	it('deletes a directory-backed draft item using the repository-data resolver filename', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs'
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(resolveCollectionItemDocument).mockResolvedValue({
			config: collectionConfig,
			indexItem: {
				itemId: 'hello-world',
				route: 'hello-world',
				path: 'src/content/posts/hello-world.md',
				filename: 'hello-world.md',
				blobSha: 'blob-hello-world',
				title: 'Hello world',
				sortDate: null
			},
			content: {
				_filename: 'legacy-name-should-not-be-used.md',
				title: 'Hello world'
			}
		} as never);

		await expect(
			actions.delete({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts?deleted=true'
		});

		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			slug: 'posts',
			itemId: 'hello-world',
			ref: 'tentman-preview'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: 'tentman-preview',
			reason: 'content-write'
		});
		expect(deleteContentDocument).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			collectionConfig.config,
			collectionConfig.path,
			{
				branch: 'tentman-preview',
				filename: 'hello-world.md'
			}
		);
	});

	it('falls back to full draft content when the repository-data resolver cannot answer', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs'
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		await expect(
			actions.delete({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts?deleted=true'
		});

		expect(resolveCollectionItemDocument).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			slug: 'posts',
			itemId: 'hello-world',
			ref: 'tentman-preview'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			collectionConfig.config,
			collectionConfig.path,
			'posts',
			'tentman-preview'
		);
		expect(deleteContentDocument).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			collectionConfig.config,
			collectionConfig.path,
			{
				branch: 'tentman-preview',
				filename: 'hello-world.md'
			}
		);
	});

	it('deletes a file-backed draft item by item id without resolver fallback work', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs'
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: fileCollectionConfig
		} as never);

		await expect(
			actions.delete({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts?deleted=true'
		});

		expect(resolveCollectionItemDocument).not.toHaveBeenCalled();
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(deleteContentDocument).toHaveBeenCalledWith(
			expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			fileCollectionConfig.config,
			fileCollectionConfig.path,
			{
				branch: 'tentman-preview',
				itemId: 'hello-world'
			}
		);
	});

	it('preserves the current route query when auth expires during item preview setup', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.saveToPreview({
			locals: {},
			params: {
				page: 'posts',
				itemId: 'hello-world'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'Hello world' }),
				filename: 'hello-world.md'
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/posts/hello-world/edit?view=full')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/posts/hello-world/edit?view=full'
		);
	});
});
