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
				}))
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
});
