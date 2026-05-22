import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repo-config-bootstrap', () => ({
	loadSelectedGitHubRepoBootstrapContext: vi.fn()
}));

import { GET } from '../../routes/api/repo/config-states/+server';
import { getCachedContent } from '$lib/stores/content-cache';
import { loadSelectedGitHubRepoBootstrapContext } from '$lib/server/repo-config-bootstrap';

const singletonConfig = {
	slug: 'about',
	path: 'content/about.tentman.json',
	config: {
		label: 'About',
		collection: false,
		state: {
			blockId: 'published',
			cases: [{ value: false, label: 'Draft', variant: 'warning', icon: 'file-pen' }]
		},
		content: {
			mode: 'file'
		},
		blocks: [
			{
				id: 'title',
				type: 'text'
			},
			{
				id: 'published',
				type: 'toggle'
			}
		]
	}
} as const;

describe('GET /api/repo/config-states', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns resolved top-level config states for singleton content', async () => {
		vi.mocked(loadSelectedGitHubRepoBootstrapContext).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			configs: [singletonConfig],
			rootConfig: null
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue({
			title: 'About',
			published: false
		});

		const response = await GET({
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: {
				delete: vi.fn()
			}
		} as never);

		expect(await response.json()).toEqual({
			statesBySlug: {
				about: {
					value: false,
					label: 'Draft',
					variant: 'warning',
					icon: 'file-pen',
					visibility: {
						navigation: true,
						header: true,
						card: true
					}
				}
			}
		});
	});
});
