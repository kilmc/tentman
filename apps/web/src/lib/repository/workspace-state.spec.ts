import { describe, expect, it } from 'vitest';
import { resolveWorkspaceState } from './workspace-state';

describe('resolveWorkspaceState', () => {
	it('treats local mode as authoritative over a stale GitHub repo snapshot', () => {
		expect(
			resolveWorkspaceState({
				isAuthenticated: true,
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk'
				},
				selectedRepoConfigSummary: {
					siteName: 'Acme Docs'
				},
				selectedBackend: {
					kind: 'local',
					repo: {
						name: 'Docs',
						pathLabel: '~/Sites/docs'
					}
				}
			})
		).toEqual({
			mode: 'local',
			isAuthenticated: true,
			selectedBackend: {
				kind: 'local',
				repo: {
					name: 'Docs',
					pathLabel: '~/Sites/docs'
				}
			},
			selectedRepo: null,
			selectedRepoConfigSummary: null
		});
	});

	it('treats the selected GitHub backend as the active repo even when selectedRepo is omitted', () => {
		expect(
			resolveWorkspaceState({
				isAuthenticated: true,
				selectedBackend: {
					kind: 'github',
					repo: {
						owner: 'acme',
						name: 'docs',
						full_name: 'acme/docs',
						default_branch: 'trunk'
					}
				},
				selectedRepoConfigSummary: {
					siteName: 'Acme Docs'
				}
			})
		).toEqual({
			mode: 'github',
			isAuthenticated: true,
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk'
				}
			},
			selectedRepo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'trunk'
			},
			selectedRepoConfigSummary: {
				siteName: 'Acme Docs'
			}
		});
	});

	it('falls back to no active workspace when no backend is selected', () => {
		expect(
			resolveWorkspaceState({
				isAuthenticated: true,
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs',
					default_branch: 'trunk'
				}
			})
		).toEqual({
			mode: 'none',
			isAuthenticated: true,
			selectedBackend: null,
			selectedRepo: null,
			selectedRepoConfigSummary: null
		});
	});
});
