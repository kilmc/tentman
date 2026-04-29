import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

function createStoreState<T>(getValue: () => T) {
	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(getValue());
			return () => {};
		}
	};
}

const localContentState = vi.hoisted(() => ({
	value: {
		status: 'ready',
		backendKey: 'local:docs',
		configs: [],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		},
		error: null
	} as {
		status: 'ready' | 'error';
		backendKey: string | null;
		configs: unknown[];
		blockConfigs: unknown[];
		blockRegistry: unknown;
		blockRegistryError: string | null;
		rootConfig: unknown;
		navigationManifest: {
			path: string;
			exists: boolean;
			manifest: unknown;
			error: string | null;
		};
		instructionDiscovery: {
			instructions: unknown[];
			issues: unknown[];
		};
		error: string | null;
	}
}));

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: createStoreState(() => localContentState.value)
}));

import Page from './+page.svelte';

const baseData = {
	isAuthenticated: true,
	githubOAuthConfigured: true,
	user: null,
	recentRepos: [],
	selectedRepo: {
		owner: 'acme',
		name: 'docs',
		full_name: 'acme/docs'
	},
	selectedBackend: {
		kind: 'github' as const,
		repo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs'
		}
	},
	configs: [],
	blockConfigs: [],
	rootConfig: null,
	navigationManifest: {
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	},
	instructionDiscovery: {
		instructions: [],
		issues: []
	},
	canAddPage: false,
	summary: {
		draftBranch: null,
		changedPages: [],
		totalChanges: 0,
		hasConfigs: true
	}
};

describe('routes/pages/+page.svelte', () => {
	beforeEach(() => {
		localContentState.value = {
			status: 'ready',
			backendKey: 'local:docs',
			configs: [],
			blockConfigs: [],
			blockRegistry: null,
			blockRegistryError: null,
			rootConfig: null,
			navigationManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: false,
				manifest: null,
				error: null
			},
			instructionDiscovery: {
				instructions: [],
				issues: []
			},
			error: null
		};
	});

	it('hides the Add Page overview card when no instructions are available', async () => {
		const screen = render(Page, {
			data: baseData
		});

		await expect.element(screen.getByRole('heading', { name: 'Add a page' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: 'Add page' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('heading', { name: 'No changes detected' })).toBeVisible();
	});

	it('shows the Add Page overview card when instructions are available', async () => {
		const screen = render(Page, {
			data: {
				...baseData,
				canAddPage: true
			}
		});

		await expect.element(screen.getByRole('heading', { name: 'Add a page' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Add page' })).toBeVisible();
	});

	it('shows a local discovery error instead of the empty config state', async () => {
		localContentState.value = {
			...localContentState.value,
			status: 'error',
			error:
				'Failed to parse content config at tentman/configs/projects.tentman.json: collection.groups[0].label is required'
		};

		const screen = render(Page, {
			data: {
				...baseData,
				selectedBackend: {
					kind: 'local' as const,
					repo: {
						name: 'Docs',
						pathLabel: '~/Docs'
					}
				}
			}
		});

		await expect
			.element(screen.getByRole('heading', { name: 'Tentman couldn’t read this repo’s config' }))
			.toBeVisible();
		await expect
			.element(screen.getByText(/tentman\/configs\/projects\.tentman\.json/i))
			.toBeVisible();
	});
});
