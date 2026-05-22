import { beforeEach, describe, expect, it, vi } from 'vitest';

const discoveryMocks = vi.hoisted(() => ({
	discoverGitHubConfigs: vi.fn(),
	discoverGitHubBlockConfigs: vi.fn()
}));

vi.mock('$lib/config/discovery', async () => {
	const actual = await vi.importActual<typeof import('$lib/config/discovery')>(
		'$lib/config/discovery'
	);

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
			full_name: 'acme/docs'
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
			full_name: 'acme/docs'
		});

		await backend.writeTextFile('/src/content/post.md', 'hello');

		expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
			expect.objectContaining({
				path: 'src/content/post.md',
				message: 'Update src/content/post.md via Tentman CMS'
			})
		);
	});

	it('normalizes root directory paths before GitHub directory reads', async () => {
		const octokit = createOctokit();
		octokit.rest.repos.getContent.mockResolvedValue({ data: [] });

		const backend = createGitHubRepositoryBackend(octokit as never, {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
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
			full_name: 'acme/docs'
		});

		await expect(backend.readRootConfig()).resolves.toEqual({ siteName: 'Acme Docs' });
		await expect(backend.readRootConfig()).resolves.toEqual({ siteName: 'Acme Docs' });
		expect(octokit.rest.repos.getContent).toHaveBeenCalledTimes(1);

		invalidateGitHubRepositoryMetadataCache(backend.cacheKey);

		await expect(backend.readRootConfig()).resolves.toEqual({ siteName: 'Acme Docs' });
		expect(octokit.rest.repos.getContent).toHaveBeenCalledTimes(2);
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
			full_name: 'acme/docs'
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
			full_name: 'acme/docs'
		});

		await backend.readTextFile('content/about.md');

		expect(getGitHubRepositoryRequestStats()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					repoKey: 'github:acme/docs',
					operation: 'readTextFile',
					path: 'content/about.md',
					ref: null,
					count: 1
				})
			])
		);
	});
});
