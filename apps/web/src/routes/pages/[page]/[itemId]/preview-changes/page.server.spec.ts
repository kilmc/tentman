import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	createContentDocument: vi.fn(),
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

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	syncCollectionItemGroupSelection: vi.fn(),
	invalidateNavigationManifestStateCache: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	invalidateContent: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn()
}));

import { actions } from './+page.server';
import { saveContentDocument } from '$lib/content/service';
import { InvalidDirectoryFilenameError } from '$lib/features/content-management/transforms';
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

describe('routes/pages/[page]/[itemId]/preview-changes/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('saves item draft changes and returns to the editor with a saved flag', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'posts',
				config: {
					blocks: [],
					content: {
						mode: 'directory'
					}
				},
				path: 'content/posts.tentman.json'
			}
		} as never);

		await expect(
			actions.createPreview({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world' }),
					filename: 'hello-world'
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
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: 'tentman-preview',
			reason: 'content-write'
		});
	});

	it('publishes item draft changes directly from the preview screen', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'posts',
				config: {
					blocks: [],
					content: {
						mode: 'directory'
					}
				},
				path: 'content/posts.tentman.json'
			}
		} as never);

		await expect(
			actions.publishNow({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world' }),
					filename: 'hello-world'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts/hello-world/edit?published=true'
		});

		expect(invalidateContent).toHaveBeenCalledWith('github:acme/docs');
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: undefined,
			reason: 'publish'
		});
	});

	it('publishes newly created collection items and returns to the collection view', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'posts',
				config: {
					blocks: [],
					content: {
						mode: 'directory'
					}
				},
				path: 'content/posts.tentman.json'
			}
		} as never);

		await expect(
			actions.publishNow({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'draft-item'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Draft item' }),
					isNew: 'true',
					newFilename: 'draft-item'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts?published=true'
		});

		expect(invalidateContent).toHaveBeenCalledWith('github:acme/docs');
	});

	it('returns a validation error when a rename targets a path outside the managed directory', async () => {
		vi.mocked(saveContentDocument).mockImplementation(async (_backend, _config, _path, _data, options) => {
			if (options?.newFilename === '../outside') {
				throw new InvalidDirectoryFilenameError(
					'Filename cannot include path separators. Use a single file name only.'
				);
			}
		});

		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: {
				cacheKey: 'github:acme/docs',
				readRootConfig: vi.fn(async () => null)
			},
			octokit: {},
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				slug: 'posts',
				config: {
					blocks: [],
					content: {
						mode: 'directory'
					}
				},
				path: 'content/posts.tentman.json'
			}
		} as never);

		const response = (await actions.createPreview({
			locals: {},
			params: {
				page: 'posts',
				itemId: 'hello-world'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'Hello world' }),
				filename: 'hello-world.md',
				newFilename: '../outside'
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/posts/hello-world/preview-changes')
		} as never)) as any;

		expect(response.status).toBe(400);
		expect(response.data).toMatchObject({
			error: 'Filename cannot include path separators. Use a single file name only.'
		});
	});

	it('preserves preview query params when auth expires during item draft save', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.createPreview({
			locals: {},
			params: {
				page: 'posts',
				itemId: 'hello-world'
			},
			request: {
				formData: async () => new FormData()
			},
			cookies: {
				delete: vi.fn()
			},
			url: new URL(
				'http://localhost/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md'
			)
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md'
		);
	});

	it('preserves preview query params when auth expires during item publish-now', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.publishNow({
			locals: {},
			params: {
				page: 'posts',
				itemId: 'hello-world'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'Hello world' }),
				filename: 'hello-world'
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL(
				'http://localhost/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md'
			)
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md'
		);
	});
});
