import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', () => ({
	createGitHubServerClient: vi.fn(),
	handleGitHubSessionError: vi.fn()
}));

vi.mock('$lib/features/draft-publishing/service', () => ({
	getTentmanDraftBranchName: vi.fn()
}));

import { GET } from './+server';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { createGitHubServerClient } from '$lib/server/auth/github';

const routeMocks = vi.hoisted(() => ({
	getContent: vi.fn(),
	getBlob: vi.fn()
}));

const DEFAULT_ASSET_QUERY = 'assetPath=static%2Fimages%2F&publicPath=%2Fimages';
const POSTS_ASSET_QUERY = 'assetPath=static%2Fimages%2Fposts%2F&publicPath=%2Fimages%2Fposts';

function createRequest(
	search = '',
	options: {
		locals?: Record<string, unknown>;
	} = {}
) {
	return {
		url: new URL(`http://localhost/api/repo/asset${search}`),
		locals: {
			isAuthenticated: true,
			githubToken: 'github-token',
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			},
			...options.locals
		},
		cookies: {
			delete: vi.fn()
		}
	};
}

describe('GET /api/repo/asset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		routeMocks.getContent.mockResolvedValue({
			data: {
				type: 'file',
				content: Buffer.from('asset-bytes').toString('base64'),
				encoding: 'base64',
				sha: 'asset-sha'
			}
		});
		routeMocks.getBlob.mockResolvedValue({
			data: {
				content: Buffer.from('blob-bytes').toString('base64'),
				encoding: 'base64'
			}
		});
		const octokit = {
			rest: {
				repos: {
					getContent: routeMocks.getContent
				},
				git: {
					getBlob: routeMocks.getBlob
				}
			}
		};
		vi.mocked(createGitHubServerClient).mockReturnValue(octokit as never);
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue(undefined);
	});

	it('serves a relative asset path from the managed draft branch when present', async () => {
		vi.mocked(getTentmanDraftBranchName).mockResolvedValue('tentman-preview');

		const response = await GET(
			createRequest(`?value=hero.jpg&${POSTS_ASSET_QUERY}`) as never
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
		routeMocks.getContent.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({
			data: {
				type: 'file',
				content: Buffer.from('default-bytes').toString('base64')
			}
		});

		const response = await GET(
			createRequest(`?value=hero.jpg&${POSTS_ASSET_QUERY}`) as never
		);

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
		await GET(
			createRequest(`?value=%2Fimages%2Fposts%2Fhero.jpg&${POSTS_ASSET_QUERY}`) as never
		);

		expect(routeMocks.getContent).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/posts/hero.jpg',
			ref: 'main'
		});
	});

	it('maps public asset paths with trailing asset directories back into the repo asset directory', async () => {
		await GET(
			createRequest(
				`?value=%2Fimages%2Fberlin-illustrated-map-theresa-grieben-a7340abb.png&${DEFAULT_ASSET_QUERY}`
			) as never
		);

		expect(routeMocks.getContent).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/berlin-illustrated-map-theresa-grieben-a7340abb.png',
			ref: 'main'
		});
	});

	it('maps public paths through the static fallback asset root', async () => {
		await GET(
			createRequest(
				'?value=%2Fimages%2Ftheresa-grieben-forest-4ec8766f.png&assetPath=static&publicPath=%2F'
			) as never
		);

		expect(routeMocks.getContent).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			path: 'static/images/theresa-grieben-forest-4ec8766f.png',
			ref: 'main'
		});
	});

	it('serves assets from explicit repository context instead of the selected repository', async () => {
		await GET(
			createRequest(
				`?owner=other&repo=site&branch=trunk&value=hero.jpg&${DEFAULT_ASSET_QUERY}`
			) as never
		);

		expect(routeMocks.getContent).toHaveBeenCalledWith({
			owner: 'other',
			repo: 'site',
			path: 'static/images/hero.jpg',
			ref: 'trunk'
		});
		expect(getTentmanDraftBranchName).toHaveBeenCalledWith(expect.anything(), 'other', 'site');
	});

	it('returns an API error instead of redirecting when there is no GitHub session', async () => {
		await expect(
			GET(
				createRequest(
					`?owner=other&repo=site&branch=trunk&value=hero.jpg&${DEFAULT_ASSET_QUERY}`,
					{
						locals: {
							isAuthenticated: false,
							githubToken: undefined,
							selectedRepo: undefined
						}
					}
				) as never
			)
		).rejects.toMatchObject({
			status: 401,
			body: {
				message: 'GitHub session required'
			}
		});
		expect(createGitHubServerClient).not.toHaveBeenCalled();
	});

	it('rejects explicit repository context without a branch when it cannot use the selected repo branch', async () => {
		await expect(
			GET(createRequest(`?owner=other&repo=site&value=hero.jpg&${DEFAULT_ASSET_QUERY}`) as never)
		).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Missing repository branch'
			}
		});
	});

	it('reads large asset bytes through the Git blob API when the contents API omits inline content', async () => {
		routeMocks.getContent.mockResolvedValueOnce({
			data: {
				type: 'file',
				content: '',
				encoding: 'none',
				sha: 'large-asset-sha'
			}
		});
		routeMocks.getBlob.mockResolvedValueOnce({
			data: {
				content: Buffer.from('large-asset-bytes').toString('base64'),
				encoding: 'base64'
			}
		});

		const response = await GET(
			createRequest(`?value=large-map.png&${DEFAULT_ASSET_QUERY}`) as never
		);

		expect(routeMocks.getBlob).toHaveBeenCalledWith({
			owner: 'acme',
			repo: 'docs',
			file_sha: 'large-asset-sha'
		});
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(await response.text()).toBe('large-asset-bytes');
	});

	it('rejects asset traversal outside configured public asset roots', async () => {
		await expect(
			GET(createRequest(`?value=..%2F..%2Fsecret.txt&${POSTS_ASSET_QUERY}`) as never)
		).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Invalid asset path'
			}
		});
	});

	it('rejects absolute external URLs and draft asset refs', async () => {
		await expect(
			GET(createRequest('?value=https%3A%2F%2Fexample.com%2Fhero.jpg') as never)
		).rejects.toMatchObject({
			status: 400
		});
		await expect(GET(createRequest('?value=draft-asset%3Ahero') as never)).rejects.toMatchObject({
			status: 400
		});
	});
});
