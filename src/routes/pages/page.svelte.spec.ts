import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

function createStoreState<T>(initialValue: T) {
	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(initialValue);
			return () => {};
		}
	};
}

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: createStoreState({
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
	})
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
});
