import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', () => ({
	handleGitHubSessionError: vi.fn()
}));

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	getCollectionIndex: vi.fn(),
	hydrateCollectionProjections: vi.fn()
}));

import { GET as getCollectionIndex } from '../../routes/api/repo/collection-index/+server';
import { POST as postCollectionProjections } from '../../routes/api/repo/collection-projections/+server';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import {
	getCollectionIndex as getRepositoryCollectionIndex,
	hydrateCollectionProjections
} from '$lib/server/repository-data';

describe('GitHub collection cache endpoints', () => {
	it('returns a serializable cheap collection index', async () => {
		const backend = { cacheKey: 'github:acme/docs?ref=main' };
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend,
			draftBranch: null
		} as never);
		vi.mocked(getRepositoryCollectionIndex).mockResolvedValue({
			identity: {
				repoKey: 'github:acme/docs?ref=main',
				ref: 'main',
				headSha: 'head',
				treeSha: 'tree',
				configSlug: 'posts',
				configPath: 'tentman/configs/posts.tentman.json',
				contentIdentity: 'src/content/posts:src/content/posts/_template.md',
				schemaIdentity: 'schema'
			},
			configSlug: 'posts',
			mode: 'directory',
			items: [
				{
					itemId: 'hello-world',
					route: 'hello-world',
					path: 'src/content/posts/hello-world.md',
					filename: 'hello-world.md',
					blobSha: 'blob-1',
					title: 'hello world',
					sortDate: null,
					hydration: 'fallback',
					hrefItemId: 'hello-world'
				}
			],
			byId: new Map(),
			byRoute: new Map(),
			byPath: new Map()
		});

		const response = await getCollectionIndex({
			url: new URL('http://localhost/api/repo/collection-index?slug=posts'),
			locals: {
				selectedRepo: {
					full_name: 'acme/docs'
				}
			},
			cookies: {}
		} as never);

		expect(await response.json()).toMatchObject({
			configSlug: 'posts',
			mode: 'directory',
			items: [
				{
					itemId: 'hello-world',
					blobSha: 'blob-1',
					hydration: 'fallback'
				}
			]
		});
		expect(getRepositoryCollectionIndex).toHaveBeenCalledWith({ backend, slug: 'posts' });
	});

	it('hydrates only the requested projection blob SHAs', async () => {
		const backend = { cacheKey: 'github:acme/docs?ref=main' };
		vi.mocked(requireGitHubContentRepository).mockResolvedValue({
			backend,
			draftBranch: null
		} as never);
		vi.mocked(hydrateCollectionProjections).mockResolvedValue({
			indexIdentity: {
				repoKey: 'github:acme/docs?ref=main',
				ref: 'main',
				headSha: 'head',
				treeSha: 'tree',
				configSlug: 'posts',
				configPath: 'tentman/configs/posts.tentman.json',
				contentIdentity: 'src/content/posts:src/content/posts/_template.md',
				schemaIdentity: 'schema'
			},
			items: [
				{
					itemId: 'stable-1',
					route: 'hello-world',
					path: 'src/content/posts/hello-world.md',
					filename: 'hello-world.md',
					blobSha: 'blob-1',
					title: 'Hello world',
					sortDate: null,
					hydration: 'hydrated',
					hrefItemId: 'hello-world'
				}
			]
		});

		const response = await postCollectionProjections({
			request: new Request('http://localhost/api/repo/collection-projections', {
				method: 'POST',
				body: JSON.stringify({
					slug: 'posts',
					blobShas: ['blob-1']
				})
			}),
			locals: {
				selectedRepo: {
					full_name: 'acme/docs'
				}
			},
			cookies: {}
		} as never);

		expect(await response.json()).toMatchObject({
			items: [
				{
					itemId: 'stable-1',
					blobSha: 'blob-1',
					hydration: 'hydrated'
				}
			]
		});
		expect(hydrateCollectionProjections).toHaveBeenCalledWith({
			backend,
			slug: 'posts',
			blobShas: ['blob-1']
		});
	});
});
