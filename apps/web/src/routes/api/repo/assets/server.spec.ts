import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageContextMocks = vi.hoisted(() => ({
	requireGitHubContentRepository: vi.fn(),
	readRootConfig: vi.fn(),
	listDirectory: vi.fn()
}));

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: pageContextMocks.requireGitHubContentRepository
}));

import { GET } from './+server';

function createRequest() {
	const url = new URL('http://localhost/api/repo/assets');
	url.searchParams.set('assetPath', 'static/images/');
	url.searchParams.set('publicPath', '/images');
	url.searchParams.set('kind', 'image');
	url.searchParams.set('extensions', '.jpg,.jpeg,.png,.webp,.gif,.svg,.avif');

	return {
		url,
		locals: {},
		cookies: {
			delete: vi.fn()
		}
	};
}

describe('GET /api/repo/assets', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pageContextMocks.readRootConfig.mockResolvedValue({
			assets: {
				path: 'static/images/',
				publicPath: '/images'
			}
		});
		pageContextMocks.listDirectory.mockImplementation(async (path: string) => {
			if (path === 'static/images') {
				return [
					{ name: 'posts', path: 'static/images/posts', kind: 'directory' },
					{ name: 'hero.jpg', path: 'static/images/hero.jpg', kind: 'file' },
					{ name: 'notes.txt', path: 'static/images/notes.txt', kind: 'file' }
				];
			}

			if (path === 'static/images/posts') {
				return [{ name: 'inline.svg', path: 'static/images/posts/inline.svg', kind: 'file' }];
			}

			return [];
		});
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend: {
				readRootConfig: pageContextMocks.readRootConfig,
				listDirectory: pageContextMocks.listDirectory
			},
			draftBranch: null
		});
	});

	it('maps root assets.path to the asset picker assetPath config', async () => {
		const response = await GET(createRequest() as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			entries: [
				expect.objectContaining({
					name: 'hero.jpg',
					repoPath: 'static/images/hero.jpg',
					publicPath: '/images/hero.jpg'
				}),
				expect.objectContaining({
					name: 'inline.svg',
					repoPath: 'static/images/posts/inline.svg',
					publicPath: '/images/posts/inline.svg'
				})
			]
		});
	});
});
