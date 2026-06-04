import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/block-registry-data', () => ({
	loadGitHubBlockRegistryData: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getCollectionNavigation: vi.fn(async () => null),
	getRepositorySnapshot: vi.fn(),
	getSingletonDocument: vi.fn(async () => null)
}));

import { GET } from '../../routes/api/repo/page-view/+server';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import {
	getCollectionNavigation,
	getRepositorySnapshot,
	getSingletonDocument
} from '$lib/server/repository-data';
import { getCachedContent } from '$lib/stores/content-cache';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

const discoveredConfig = {
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

const singletonConfig = {
	slug: 'about',
	path: 'content/about.tentman.json',
	config: {
		label: 'About',
		collection: false,
		content: {
			mode: 'file',
			path: 'src/content/about.md'
		},
		blocks: []
	}
} as const;

describe('GET /api/repo/page-view', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCollectionNavigation).mockResolvedValue(null);
		vi.mocked(getSingletonDocument).mockResolvedValue(null);
		vi.mocked(getRepositorySnapshot).mockResolvedValue({
			rootConfig: null,
			configIndex: {
				bySlug: new Map<string, unknown>([
					['posts', discoveredConfig],
					['about', singletonConfig]
				])
			},
			blockConfigIndex: {
				configs: []
			}
		} as never);
	});

	it('returns indexed collection navigation without loading full collection content', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			draftBranch: null
		} as never);
		vi.mocked(getCollectionNavigation).mockResolvedValue({
			items: [
				{
					itemId: 'hello-world',
					title: 'Hello world',
					sortDate: null
				}
			],
			groups: []
		});
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			content: null,
			collectionNavigation: {
				items: [
					{
						itemId: 'hello-world',
						title: 'Hello world'
					}
				],
				groups: []
			},
			mode: 'github',
			pageSlug: 'posts'
		});
		expect(getCollectionNavigation).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			slug: 'posts'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
	});

	it('falls back to full content when collection navigation cannot answer', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			draftBranch: null
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			content: [
				{
					_filename: 'hello-world.md',
					title: 'Hello world'
				}
			],
			mode: 'github',
			pageSlug: 'posts'
		});
		expect(getCollectionNavigation).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			slug: 'posts'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			discoveredConfig.config,
			discoveredConfig.path,
			discoveredConfig.slug
		);
	});

	it('returns singleton content from repository data without using the full content cache', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			draftBranch: null
		} as never);
		vi.mocked(getSingletonDocument).mockResolvedValue({
			title: 'About from blob'
		});
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=about'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'about'
			},
			content: {
				title: 'About from blob'
			},
			mode: 'github',
			pageSlug: 'about'
		});
		expect(getSingletonDocument).toHaveBeenCalledWith({
			backend: { cacheKey: 'github:acme/docs' },
			slug: 'about'
		});
		expect(getCachedContent).not.toHaveBeenCalled();
	});

	it('returns the active managed draft branch when content loads from the draft by default', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs?ref=tentman-preview' },
			draftBranch: 'tentman-preview'
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue({
			title: 'Draft about'
		});
		vi.mocked(loadGitHubBlockRegistryData).mockResolvedValue({
			blockConfigs: [],
			packageBlocks: [],
			blockRegistryError: null
		});

		const response = await GET({
			url: new URL('http://localhost/api/repo/page-view?slug=posts'),
			locals: {},
			cookies: createCookies()
		} as never);

		expect(await response.json()).toMatchObject({
			content: {
				title: 'Draft about'
			},
			branch: 'tentman-preview'
		});
		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs?ref=tentman-preview' },
			discoveredConfig.config,
			discoveredConfig.path,
			discoveredConfig.slug
		);
	});

	it('clears the session and returns 401 when content fetch gets a GitHub 401', async () => {
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			draftBranch: null
		} as never);
		vi.mocked(getCachedContent).mockRejectedValue({ status: 401 });

		const cookies = createCookies();

		await expect(
			GET({
				url: new URL('http://localhost/api/repo/page-view?slug=posts'),
				locals: {},
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
	});
});
