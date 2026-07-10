import { beforeEach, describe, expect, it, vi } from 'vitest';

const discoveryMocks = vi.hoisted(() => ({
	discoverGitHubConfigs: vi.fn(),
	discoverGitHubBlockConfigs: vi.fn()
}));

vi.mock('$lib/config/discovery', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/config/discovery')>('$lib/config/discovery');

	return {
		...actual,
		discoverGitHubConfigs: discoveryMocks.discoverGitHubConfigs,
		discoverGitHubBlockConfigs: discoveryMocks.discoverGitHubBlockConfigs
	};
});

import {
	clearGitHubRepositoryMetadataCache,
	clearGitHubRepositoryRequestStats,
	createGitHubRepositoryBackend,
	getGitHubRepositoryRequestStats,
	invalidateGitHubRepositoryMetadataCache
} from './github';

function createOctokit() {
	return {
		rest: {
			git: {
				getRef: vi.fn(),
				getCommit: vi.fn(),
				createBlob: vi.fn(),
				createTree: vi.fn(),
				createCommit: vi.fn(),
				updateRef: vi.fn()
			},
			repos: {
				getContent: vi.fn(),
				createOrUpdateFileContents: vi.fn(),
				deleteFile: vi.fn()
			}
		}
	};
}

describe('repository/github', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearGitHubRepositoryMetadataCache();
		clearGitHubRepositoryRequestStats();
	});

	it('strips leading slashes before GitHub file reads', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent.mockResolvedValue({
			data: {
				type: 'file',
				content: Buffer.from('hello').toString('base64')
			}
		});

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await expect(backend.readTextFile('/src/content/post.md')).resolves.toBe('hello');
		expect(octokit.rest.repos.getContent).toHaveBeenCalledWith(
			expect.objectContaining({
				path: 'src/content/post.md'
			})
		);
	});

	it('strips leading slashes before GitHub file writes', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
		octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await backend.writeTextFile('/src/content/post.md', 'hello');

		expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
			expect.objectContaining({
				path: 'src/content/post.md',
				message: 'Update src/content/post.md via Tentman CMS'
			})
		);
	});

	it('commits multiple file changes through one GitHub commit', async () => {
		const octokit = createOctokit();
		octokit.rest.git.getRef.mockResolvedValue({
			data: {
				object: {
					sha: 'base-commit'
				}
			}
		});
		octokit.rest.git.getCommit.mockResolvedValue({
			data: {
				tree: {
					sha: 'base-tree'
				}
			}
		});
		octokit.rest.git.createBlob
			.mockResolvedValueOnce({
				data: {
					sha: 'text-blob'
				}
			})
			.mockResolvedValueOnce({
				data: {
					sha: 'binary-blob'
				}
			});
		octokit.rest.git.createTree.mockResolvedValue({
			data: {
				sha: 'next-tree'
			}
		});
		octokit.rest.git.createCommit.mockResolvedValue({
			data: {
				sha: 'next-commit'
			}
		});
		octokit.rest.git.updateRef.mockResolvedValue({});

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await backend.commitChanges?.(
			[
				{
					type: 'writeText',
					path: '/src/content/post.md',
					content: 'hello'
				},
				{
					type: 'writeBinary',
					path: 'static/image.png',
					content: new Uint8Array([1, 2, 3])
				},
				{
					type: 'delete',
					path: 'src/content/old.md'
				}
			],
			{
				message: 'Update draft',
				ref: 'tentman-preview'
			}
		);

		expect(octokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
		expect(octokit.rest.git.createCommit).toHaveBeenCalledTimes(1);
		expect(octokit.rest.git.createCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Update draft',
				tree: 'next-tree',
				parents: ['base-commit']
			})
		);
		expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
			expect.objectContaining({
				base_tree: 'base-tree',
				tree: [
					{
						path: 'src/content/post.md',
						mode: '100644',
						type: 'blob',
						sha: 'text-blob'
					},
					{
						path: 'static/image.png',
						mode: '100644',
						type: 'blob',
						sha: 'binary-blob'
					},
					{
						path: 'src/content/old.md',
						mode: '100644',
						type: 'blob',
						sha: null
					}
				]
			})
		);
		expect(octokit.rest.git.updateRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'heads/tentman-preview',
				sha: 'next-commit'
			})
		);
	});

	it('normalizes root directory paths before GitHub directory reads', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent.mockResolvedValue({ data: [] });

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await backend.listDirectory('/');

		expect(octokit.rest.repos.getContent).toHaveBeenCalledWith(
			expect.objectContaining({
				path: '.'
			})
		);
	});

	it('caches root config reads per backend cache key until invalidated', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent.mockResolvedValue({
			data: {
				type: 'file',
				content: Buffer.from(JSON.stringify({ siteName: 'Acme Docs' })).toString('base64')
			}
		});

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await expect(backend.readRootConfig()).resolves.toEqual({ siteName: 'Acme Docs' });
		await expect(backend.readRootConfig()).resolves.toEqual({ siteName: 'Acme Docs' });
		expect(octokit.rest.repos.getContent).toHaveBeenCalledTimes(1);

		invalidateGitHubRepositoryMetadataCache(backend.cacheKey);

		await expect(backend.readRootConfig()).resolves.toEqual({ siteName: 'Acme Docs' });
		expect(octokit.rest.repos.getContent).toHaveBeenCalledTimes(2);
	});

	it('caches text file reads and invalidates written paths', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent
			.mockResolvedValueOnce({
				data: {
					type: 'file',
					content: Buffer.from('before').toString('base64'),
					sha: 'before-sha'
				}
			})
			.mockResolvedValueOnce({
				data: {
					type: 'file',
					content: Buffer.from('before').toString('base64'),
					sha: 'before-sha'
				}
			})
			.mockResolvedValueOnce({
				data: {
					type: 'file',
					content: Buffer.from('after').toString('base64'),
					sha: 'after-sha'
				}
			});
		octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await expect(backend.readTextFile('content/about.md')).resolves.toBe('before');
		await expect(backend.readTextFile('content/about.md')).resolves.toBe('before');
		expect(octokit.rest.repos.getContent).toHaveBeenCalledTimes(1);

		await backend.writeTextFile('content/about.md', 'after');
		await expect(backend.readTextFile('content/about.md')).resolves.toBe('after');
		expect(octokit.rest.repos.getContent).toHaveBeenCalledTimes(3);
	});

	it('caches discovered block configs per backend cache key until invalidated', async () => {
		discoveryMocks.discoverGitHubBlockConfigs.mockResolvedValue([
			{
				path: 'tentman/blocks/seo.tentman.json',
				config: {
					type: 'block',
					id: 'seo',
					label: 'SEO',
					blocks: []
				}
			}
		]);

		const backend = createGitHubRepositoryBackend(createOctokit() as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await expect(backend.discoverBlockConfigs()).resolves.toHaveLength(1);
		await expect(backend.discoverBlockConfigs()).resolves.toHaveLength(1);
		expect(discoveryMocks.discoverGitHubBlockConfigs).toHaveBeenCalledTimes(1);

		invalidateGitHubRepositoryMetadataCache(backend.cacheKey);

		await expect(backend.discoverBlockConfigs()).resolves.toHaveLength(1);
		expect(discoveryMocks.discoverGitHubBlockConfigs).toHaveBeenCalledTimes(2);
	});

	it('records GitHub request stats for backend operations in dev mode', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent.mockResolvedValue({
			data: {
				type: 'file',
				content: Buffer.from('hello').toString('base64')
			}
		});

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'trunk'
		});

		await backend.readTextFile('content/about.md');

		expect(getGitHubRepositoryRequestStats()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					repoKey: 'github:acme/docs?ref=trunk',
					operation: 'readTextFile',
					path: 'content/about.md',
					ref: 'trunk',
					count: 1
				})
			])
		);
	});
});
