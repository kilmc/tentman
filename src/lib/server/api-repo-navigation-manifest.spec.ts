import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/config-cache', () => ({
	getCachedConfigs: vi.fn(),
	invalidateCache: vi.fn()
}));

vi.mock('$lib/server/auth/github', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth/github')>('$lib/server/auth/github');

	return {
		...actual,
		createGitHubServerClient: vi.fn(() => ({ rest: {} }))
	};
});

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	buildNavigationManifestFromRepository: vi.fn(async () => ({
		version: 1,
		content: {
			items: ['about', 'posts']
		}
	})),
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: true,
		manifest: {
			version: 1,
			content: {
				items: ['about', 'posts']
			}
		},
		error: null
	})),
	parseNavigationManifest: vi.fn((value: string) => JSON.parse(value)),
	writeMissingContentConfigIds: vi.fn(async () => []),
	writeNavigationManifest: vi.fn(async () => {})
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn(() => ({
		kind: 'github',
		cacheKey: 'github:acme/docs',
		label: 'acme/docs',
		supportsDraftBranches: true
	}))
}));

import { POST } from '../../routes/api/repo/navigation-manifest/+server';
import { getCachedConfigs, invalidateCache } from '$lib/stores/config-cache';
import {
	buildNavigationManifestFromRepository,
	loadNavigationManifestState,
	writeMissingContentConfigIds,
	writeNavigationManifest
} from '$lib/features/content-management/navigation-manifest';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

describe('POST /api/repo/navigation-manifest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('enables manual navigation by adding ids and writing a generated manifest', async () => {
		vi.mocked(getCachedConfigs)
			.mockResolvedValueOnce([
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						label: 'About',
						content: {
							mode: 'file'
						},
						blocks: []
					}
				}
			] as never)
			.mockResolvedValueOnce([
				{
					slug: 'about',
					path: 'content/about.tentman.json',
					config: {
						type: 'content',
						id: 'about',
						label: 'About',
						content: {
							mode: 'file'
						},
						blocks: []
					}
				}
			] as never);

		const response = await POST({
			request: new Request('http://localhost/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'enable'
				})
			}),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(writeMissingContentConfigIds).toHaveBeenCalled();
		expect(invalidateCache).toHaveBeenCalledWith('github:acme/docs');
		expect(buildNavigationManifestFromRepository).toHaveBeenCalled();
		expect(writeNavigationManifest).toHaveBeenCalled();
		expect(await response.json()).toEqual({
			navigationManifest: await loadNavigationManifestState({} as never)
		});
	});

	it('validates and saves a manifest payload', async () => {
		vi.mocked(getCachedConfigs).mockResolvedValue([] as never);

		await POST({
			request: new Request('http://localhost/api/repo/navigation-manifest', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					action: 'save-manifest',
					manifest: {
						version: 1,
						content: {
							items: ['posts']
						}
					}
				})
			}),
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: createCookies()
		} as never);

		expect(writeNavigationManifest).toHaveBeenCalledWith(
			expect.anything(),
			{
				version: 1,
				content: {
					items: ['posts']
				}
			},
			{
				message: 'Update Tentman navigation manifest'
			}
		);
	});
});
