import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getTentmanDraftBranchName: vi.fn()
}));

import { GET } from './+server';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { requireGitHubRepository } from '$lib/server/page-context';

const routeMocks = vi.hoisted(() => ({
	readRootConfig: vi.fn(),
	getContent: vi.fn()
}));

function createRequest(search = '') {
	return {
		url: new URL(`http://localhost/api/repo/asset${search}`),
		locals: {},
		cookies: {
			delete: vi.fn()
		}
	};
}

describe('GET /api/repo/asset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		routeMocks.readRootConfig.mockResolvedValue({
			assetsDir: 'static/images'
		});
		routeMocks.getContent.mockResolvedValue({
			data: {
				type: 'file',
				content: Buffer.from('asset-bytes').toString('base64')
			}
		});
		vi.mocked(requireGitHubRepository).mockReturnValue({
			octokit: {
				rest: {
					repos: {
						getContent: routeMocks.getContent
					}
				}
			},
			owner: 'acme',
			name: 'docs',
			defaultBranch: 'main',
			backend: {
				readRootConfig: routeMocks.readRootConfig
			}
		} as never);
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue(undefined);
	});

	it('serves a relative asset path from the managed draft branch when present', async () => {
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');

		const response = await GET(
			createRequest('?value=hero.jpg&assetsDir=static/images/posts') as never
		);

		expect(routeMocks.getContent).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/posts/hero.jpg',
			ref: 'tentman-preview'
		});
		expect(response.headers.get('content-type')).toBe('image/jpeg');
		expect(await response.text()).toBe('asset-bytes');
	});

	it('falls back to the default branch when the asset is missing on the draft branch', async () => {
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');
		routeMocks.getContent
			.mockRejectedValueOnce({ status: 404 })
			.mockResolvedValueOnce({
				data: {
					type: 'file',
					content: Buffer.from('default-bytes').toString('base64')
				}
			});

		const response = await GET(createRequest('?value=hero.jpg&assetsDir=static/images/posts') as never);

		expect(routeMocks.getContent).toHaveBeenNthCalledWith(1, {
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/posts/hero.jpg',
			ref: 'tentman-preview'
		});
		expect(routeMocks.getContent).toHaveBeenNthCalledWith(2, {
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/posts/hero.jpg',
			ref: 'main'
		});
		expect(await response.text()).toBe('default-bytes');
	});

	it('maps public asset paths back into the repo asset directory', async () => {
		await GET(createRequest('?value=%2Fimages%2Fposts%2Fhero.jpg&assetsDir=static/images/posts') as never);

		expect(routeMocks.getContent).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/posts/hero.jpg',
			ref: 'main'
		});
	});

	it('rejects asset traversal outside configured public asset roots', async () => {
		await expect(
			GET(createRequest('?value=..%2F..%2Fsecret.txt&assetsDir=static/images/posts') as never)
		).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Invalid asset path'
			}
		});
	});

	it('rejects absolute external URLs and draft asset refs', async () => {
		await expect(GET(createRequest('?value=https%3A%2F%2Fexample.com%2Fhero.jpg') as never)).rejects.toMatchObject({
			status: 400
		});
		await expect(GET(createRequest('?value=draft-asset%3Ahero') as never)).rejects.toMatchObject({
			status: 400
		});
	});
});
