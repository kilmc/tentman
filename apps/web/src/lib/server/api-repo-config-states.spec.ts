import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

vi.mock('$lib/server/repo-config-bootstrap', () => ({
	loadSelectedGitHubRepoConfigStates: vi.fn()
}));

import { GET } from '../../routes/api/repo/config-states/+server';
import { getCachedContent } from '$lib/stores/content-cache';
import { loadSelectedGitHubRepoConfigStates } from '$lib/server/repo-config-bootstrap';

describe('GET /api/repo/config-states', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns scoped workflow config states from the selected repository capability', async () => {
		vi.mocked(loadSelectedGitHubRepoConfigStates).mockResolvedValue({
			source: 'repository-data',
			stateConfigCount: 1,
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
			},
			workflowData: {
				identity: {
					mode: 'github',
					workspaceKey: 'github:acme/docs',
					workspaceLabel: 'acme/docs',
					dataSetKey: 'dataset:123',
					resolvedAt: 123,
					hasEditableDraft: false
				},
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
				},
				stateConfigCount: 1,
				readiness: 'ready',
				cacheMiss: null
			}
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
			},
			workflowData: {
				identity: {
					mode: 'github',
					workspaceKey: 'github:acme/docs',
					workspaceLabel: 'acme/docs',
					dataSetKey: 'dataset:123',
					resolvedAt: 123,
					hasEditableDraft: false
				},
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
				},
				stateConfigCount: 1,
				readiness: 'ready',
				cacheMiss: null
			}
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(loadSelectedGitHubRepoConfigStates).toHaveBeenCalledOnce();
	});
});
