import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraftChangeIndexCache, getDraftChangeIndex } from './drafts';

function createOctokit(
	files: Array<{ filename: string; status: string; previous_filename?: string }>
) {
	return {
		rest: {
			repos: {
				compareCommits: vi.fn(async () => ({
					data: {
						merge_base_commit: {
							sha: 'base-sha'
						},
						files
					}
				})),
				getBranch: vi.fn(async ({ branch }: { branch: string }) => ({
					data: {
						commit: {
							sha: `${branch}-sha`,
							commit: {
								committer: {
									date: '2026-06-01T12:00:00Z'
								}
							}
						}
					}
				}))
			}
		}
	};
}

describe('draft change index repository data layer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearDraftChangeIndexCache();
	});

	it('classifies singleton and directory collection changes from one compare call', async () => {
		const octokit = createOctokit([
			{
				filename: 'src/content/about.md',
				status: 'modified'
			},
			{
				filename: 'src/content/posts/hello.md',
				status: 'modified'
			},
			{
				filename: 'src/content/posts/new.md',
				status: 'added'
			},
			{
				filename: 'src/content/posts/_template.md',
				status: 'modified'
			}
		]);

		const index = await getDraftChangeIndex({
			octokit: octokit as never,
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			configs: [
				{
					slug: 'about',
					path: 'tentman/configs/about.tentman.json',
					config: {
						label: 'About',
						collection: false,
						content: {
							mode: 'file',
							path: '../../src/content/about.md'
						},
						blocks: []
					}
				},
				{
					slug: 'posts',
					path: 'tentman/configs/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory',
							path: '../../src/content/posts',
							template: '../../src/content/posts/_template.md'
						},
						blocks: []
					}
				}
			] as never
		});

		expect(index.byConfigSlug.get('about')).toEqual({
			slug: 'about',
			modified: ['_singleton'],
			created: [],
			deleted: [],
			requiresFullFetch: false
		});
		expect(index.byConfigSlug.get('posts')).toEqual({
			slug: 'posts',
			modified: ['hello'],
			created: ['new'],
			deleted: [],
			requiresFullFetch: false
		});
		expect(octokit.rest.repos.compareCommits).toHaveBeenCalledTimes(1);
	});

	it('does not reuse cached indexes across different config sets', async () => {
		const octokit = createOctokit([
			{
				filename: 'src/content/posts/hello.md',
				status: 'modified'
			}
		]);
		const baseInput = {
			octokit: octokit as never,
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'main',
			draftBranch: 'tentman-preview'
		};
		const postsConfig = {
			slug: 'posts',
			path: 'tentman/configs/posts.tentman.json',
			config: {
				label: 'Posts',
				collection: true,
				content: {
					mode: 'directory',
					path: '../../src/content/posts',
					template: '../../src/content/posts/_template.md'
				},
				blocks: []
			}
		};

		await getDraftChangeIndex({
			...baseInput,
			configs: [postsConfig] as never
		});
		const secondIndex = await getDraftChangeIndex({
			...baseInput,
			configs: [
				postsConfig,
				{
					slug: 'about',
					path: 'tentman/configs/about.tentman.json',
					config: {
						label: 'About',
						collection: false,
						content: {
							mode: 'file',
							path: '../../src/content/about.md'
						},
						blocks: []
					}
				}
			] as never
		});

		expect(secondIndex.byConfigSlug.has('about')).toBe(true);
		expect(octokit.rest.repos.compareCommits).toHaveBeenCalledTimes(2);
	});

	it('requires a full fetch when a directory collection item is renamed out of the collection', async () => {
		const octokit = createOctokit([
			{
				filename: 'src/content/archive/hello.md',
				previous_filename: 'src/content/posts/hello.md',
				status: 'renamed'
			}
		]);

		const index = await getDraftChangeIndex({
			octokit: octokit as never,
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			configs: [
				{
					slug: 'posts',
					path: 'tentman/configs/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory',
							path: '../../src/content/posts',
							template: '../../src/content/posts/_template.md'
						},
						blocks: []
					}
				}
			] as never
		});

		expect(index.byConfigSlug.get('posts')).toEqual({
			slug: 'posts',
			modified: [],
			created: [],
			deleted: [],
			requiresFullFetch: true
		});
	});

	it('defaults extensionless directory templates to markdown item changes', async () => {
		const octokit = createOctokit([
			{
				filename: 'src/content/posts/hello.md',
				status: 'modified'
			}
		]);

		const index = await getDraftChangeIndex({
			octokit: octokit as never,
			owner: 'acme',
			repo: 'docs',
			baseBranch: 'main',
			draftBranch: 'tentman-preview',
			configs: [
				{
					slug: 'posts',
					path: 'tentman/configs/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory',
							path: '../../src/content/posts',
							template: '../../src/content/posts/_template'
						},
						blocks: []
					}
				}
			] as never
		});

		expect(index.byConfigSlug.get('posts')).toEqual({
			slug: 'posts',
			modified: ['hello'],
			created: [],
			deleted: [],
			requiresFullFetch: false
		});
	});
});
