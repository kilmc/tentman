import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	previewContentChanges: vi.fn()
}));

import { GET } from '../../routes/api/repo/item-preview/+server';
import { previewContentChanges } from '$lib/content/service';
import { requireDiscoveredConfig } from '$lib/server/page-context';

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

describe('GET /api/repo/item-preview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the collection preview bootstrap payload', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			owner: 'acme',
			name: 'docs',
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(previewContentChanges).mockResolvedValue({
			totalChanges: 1,
			files: [
				{
					type: 'create',
					path: 'content/posts/hello-world.md'
				}
			]
		} as never);

		const encodedData = Buffer.from(JSON.stringify({ title: 'Hello world' })).toString('base64url');
		const response = await GET({
			url: new URL(
				`http://localhost/api/repo/item-preview?slug=posts&itemId=hello-world&data=${encodedData}&new=true&newFilename=hello-world`
			),
			locals: {},
			cookies: {
				delete: vi.fn()
			}
		} as never);

		expect(previewContentChanges).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			collectionConfig.config,
			collectionConfig.path,
			{ title: 'Hello world' },
			{
				isNew: true,
				newFilename: 'hello-world'
			}
		);

		expect(await response.json()).toMatchObject({
			discoveredConfig: {
				slug: 'posts'
			},
			contentData: {
				title: 'Hello world'
			},
			itemId: 'hello-world',
			isNew: true,
			newFilename: 'hello-world',
			repo: {
				owner: 'acme',
				name: 'docs'
			}
		});
	});

	it('returns a redirect target when the config is not a collection', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			owner: 'acme',
			name: 'docs',
			discoveredConfig: {
				...collectionConfig,
				config: {
					...collectionConfig.config,
					collection: false
				}
			}
		} as never);

		const response = await GET({
			url: new URL('http://localhost/api/repo/item-preview?slug=posts&itemId=hello-world&data=abc'),
			locals: {},
			cookies: {
				delete: vi.fn()
			}
		} as never);

		expect(await response.json()).toEqual({
			redirectTo: '/pages/posts/edit'
		});
	});
});
