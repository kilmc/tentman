import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/content/service', () => ({
	fetchContentDocument: vi.fn()
}));

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	NAVIGATION_MANIFEST_PATH: 'tentman/navigation-manifest.json',
	loadNavigationManifestState: vi.fn()
}));

vi.mock('$lib/github/branch', () => ({
	listChangedFilesBetweenRefs: vi.fn()
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn()
}));

import { fetchContentDocument } from '$lib/content/service';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import { listChangedFilesBetweenRefs } from '$lib/github/branch';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { buildPublishReviewModel } from './build-review-model';

const baseConfigs = [
	{
		slug: 'about',
		path: 'content/about.tentman.json',
		config: {
			type: 'content',
			label: 'About',
			_tentmanId: 'about',
			content: {
				mode: 'file',
				path: 'src/content/about.md'
			},
			blocks: [{ id: 'title', type: 'text', label: 'Title' }]
		}
	},
	{
		slug: 'posts',
		path: 'content/posts.tentman.json',
		config: {
			type: 'content',
			label: 'Posts',
			_tentmanId: 'posts',
			idField: 'slug',
			collection: {
				sorting: 'manual'
			},
			content: {
				mode: 'directory',
				path: 'src/content/posts',
				template: 'templates/post.md'
			},
			blocks: [{ id: 'title', type: 'text', label: 'Title' }]
		}
	}
] as const;

const draftConfigs = [baseConfigs[1], baseConfigs[0]];

function markdownPost(data: Record<string, string>): string {
	return `---\n${Object.entries(data)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join('\n')}\n---\n`;
}

describe('buildPublishReviewModel', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(createGitHubRepositoryBackend).mockImplementation((_octokit, _repo, options) => {
			const ref = options?.defaultRef;

			return {
				discoverConfigs: vi.fn(async () => (ref === 'tentman-preview' ? draftConfigs : baseConfigs)),
				readRootConfig: vi.fn(async () => ({
					content: {
						sorting: 'manual'
					}
				})),
				readTextFile: vi.fn(async (path: string) => {
					if (path.endsWith('hello-world.md')) {
						return ref === 'tentman-preview'
							? markdownPost({
									_tentmanId: 'post-1',
									slug: 'hello-world',
									title: 'Hello world updated'
								})
							: markdownPost({
									_tentmanId: 'post-1',
									slug: 'hello-world',
									title: 'Hello world'
								});
					}

					if (path.endsWith('new-post.md')) {
						return markdownPost({
							_tentmanId: 'post-3',
							slug: 'new-post',
							title: 'New post'
						});
					}

					if (path.endsWith('old-post.md')) {
						return markdownPost({
							_tentmanId: 'post-4',
							slug: 'old-post',
							title: 'Old post'
						});
					}

					throw new Error(`Unexpected readTextFile path: ${path}`);
				})
			} as never;
		});

		vi.mocked(loadNavigationManifestState).mockResolvedValue({
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1,
				content: {
					items: ['posts', 'about']
				},
				collections: {
					posts: {
						items: ['post-2', 'post-1']
					}
				}
			},
			error: null
		});

		vi.mocked(fetchContentDocument).mockImplementation(async (_backend, config, _path, options) => {
			if (config._tentmanId === 'posts') {
				if (options?.branch === 'tentman-preview') {
					return [
						{ _tentmanId: 'post-2', slug: 'second-post', title: 'Second post' },
						{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world updated' }
					];
				}

				return [
					{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world' },
					{ _tentmanId: 'post-2', slug: 'second-post', title: 'Second post' }
				];
			}

			return options?.branch === 'tentman-preview'
				? { title: 'About us' }
				: { title: 'About' };
		});
	});

	it('orders changed sections using Tentman config ordering', async () => {
		vi.mocked(listChangedFilesBetweenRefs).mockResolvedValue([
			{
				filename: 'src/content/posts/hello-world.md',
				status: 'modified'
			},
			{
				filename: 'src/content/about.md',
				status: 'modified'
			}
		] as never);

		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview'
		});

		expect(reviewModel.sections.map((section) => section.configSlug)).toEqual(['posts', 'about']);
	});

	it('expands the sole changed section and its only item by default', async () => {
		vi.mocked(listChangedFilesBetweenRefs).mockResolvedValue([
			{
				filename: 'src/content/posts/hello-world.md',
				status: 'modified'
			}
		] as never);

		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview'
		});

		expect(reviewModel.sections.map((section) => section.configSlug)).toEqual(['posts']);
		expect(reviewModel.sections[0]).toMatchObject({
			configSlug: 'posts',
			defaultExpanded: true
		});
		expect(reviewModel.sections[0].items).toHaveLength(1);
		expect(reviewModel.sections[0].items[0]).toMatchObject({
			itemId: 'post-1',
			defaultExpanded: true
		});
	});

	it('uses injected changed files instead of listing changed files again', async () => {
		vi.mocked(listChangedFilesBetweenRefs).mockResolvedValue([]);

		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			changedFiles: [
				{
					filename: 'src/content/posts/hello-world.md',
					status: 'modified'
				}
			]
		});

		expect(listChangedFilesBetweenRefs).not.toHaveBeenCalled();
		expect(reviewModel.sections.map((section) => section.configSlug)).toEqual(['posts']);
	});

	it('loads only changed directory item files for simple item review sections', async () => {
		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			changedFiles: [
				{
					filename: 'src/content/posts/hello-world.md',
					status: 'modified'
				}
			]
		});

		const [, baseBackendCall, draftBackendCall] = vi.mocked(createGitHubRepositoryBackend).mock.results;
		const baseBackend = await baseBackendCall?.value;
		const draftBackend = await draftBackendCall?.value;

		expect(fetchContentDocument).not.toHaveBeenCalled();
		expect(baseBackend.readTextFile).toHaveBeenCalledWith('src/content/posts/hello-world.md', {
			ref: 'main'
		});
		expect(draftBackend.readTextFile).toHaveBeenCalledWith('src/content/posts/hello-world.md', {
			ref: 'tentman-preview'
		});
		expect(reviewModel.sections[0]?.items[0]).toMatchObject({
			itemId: 'post-1',
			title: 'Hello world updated',
			changeKinds: ['edited']
		});
	});

	it('reports config-only changes without fetching full content documents', async () => {
		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			changedFiles: [
				{
					filename: 'content/posts.tentman.json',
					status: 'modified'
				}
			]
		});

		expect(fetchContentDocument).not.toHaveBeenCalled();
		expect(reviewModel.sections).toEqual([]);
		expect(reviewModel.otherSiteChanges).toMatchObject({
			files: [
				{
					path: 'content/posts.tentman.json',
					status: 'modified'
				}
			]
		});
	});

	it('reports directory template changes without fetching full content documents', async () => {
		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			changedFiles: [
				{
					filename: 'templates/post.md',
					status: 'modified'
				}
			]
		});

		expect(fetchContentDocument).not.toHaveBeenCalled();
		expect(reviewModel.sections).toEqual([]);
		expect(reviewModel.otherSiteChanges).toMatchObject({
			files: [
				{
					path: 'templates/post.md',
					status: 'modified'
				}
			]
		});
	});

	it('uses explicit item labels in review cards', async () => {
		vi.mocked(createGitHubRepositoryBackend).mockImplementation((_octokit, _repo, options) => {
			const ref = options?.defaultRef;

			return {
				discoverConfigs: vi.fn(async () => [
					baseConfigs[0],
					{
						...baseConfigs[1],
						config: {
							...baseConfigs[1].config,
							blocks: [
								{ id: 'title', type: 'text', label: 'Title' },
								{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true }
							]
						}
					}
				]),
				readRootConfig: vi.fn(async () => ({
					content: {
						sorting: 'manual'
					}
				}))
			} as never;
		});

		vi.mocked(listChangedFilesBetweenRefs).mockResolvedValue([
			{
				filename: 'src/content/posts/hello-world.md',
				status: 'modified'
			}
		] as never);

		vi.mocked(fetchContentDocument).mockImplementation(async (_backend, config, _path, options) => {
			if (config._tentmanId === 'posts') {
				return options?.branch === 'tentman-preview'
					? [{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world', summary: 'Launch update' }]
					: [{ _tentmanId: 'post-1', slug: 'hello-world', title: 'Hello world', summary: 'Original summary' }];
			}

			return options?.branch === 'tentman-preview' ? { title: 'About us' } : { title: 'About' };
		});

		const reviewModel = await buildPublishReviewModel({
			octokit: {} as never,
			owner: 'acme',
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			backend: {} as never,
			configs: baseConfigs as never,
			baseBranch: 'main',
			draftBranch: 'tentman-preview'
		});

		expect(reviewModel.sections[0]?.items[0]?.title).toBe('Launch update');
	});
});
