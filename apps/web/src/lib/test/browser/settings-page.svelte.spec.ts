import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import type { RepositoryBackend } from '$lib/repository/types';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		}
	};
}

function createBackend(files: Record<string, string>): RepositoryBackend {
	return {
		kind: 'local',
		cacheKey: 'local:docs',
		label: 'Local docs',
		supportsDraftBranches: false,
		async discoverConfigs() {
			return [];
		},
		async discoverBlockConfigs() {
			return [];
		},
		async readRootConfig() {
			return JSON.parse(files['tentman.json']) as never;
		},
		async readTextFile(path: string) {
			const value = files[path];
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}

			return value;
		},
		async writeTextFile(path: string, content: string) {
			files[path] = content;
		},
		async writeBinaryFile() {},
		async deleteFile(path: string) {
			delete files[path];
		},
		async listDirectory() {
			return [];
		},
		async fileExists(path: string) {
			return path in files;
		}
	};
}

const settingsPageMocks = vi.hoisted(() => {
	const files = {
		'tentman.json': JSON.stringify({
			siteName: 'Docs',
			local: {
				previewUrl: 'http://localhost:5173/'
			}
		})
	};
	const backend = createBackend(files);
	const localContentReadyState = {
		status: 'ready' as const,
		backendKey: 'local:docs',
		configs: [],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: JSON.parse(files['tentman.json']),
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
	const localContentStore = createStoreState(localContentReadyState);
	const localRepoStore = createStoreState({
		status: 'ready' as const,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		backend,
		error: null
	});
	const refresh = vi.fn(async () => {
		localContentStore.set({
			...localContentReadyState,
			rootConfig: JSON.parse(files['tentman.json'])
		});
	});

	return {
		files,
		localContentReadyState,
		localContentStore,
		localRepoStore,
		refresh,
		invalidate: vi.fn(async () => {})
	};
});

vi.mock('$app/navigation', () => ({
	invalidate: settingsPageMocks.invalidate
}));

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost:5174/pages/settings')
	}
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: settingsPageMocks.localContentStore.subscribe,
		refresh: settingsPageMocks.refresh
	}
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: settingsPageMocks.localRepoStore.subscribe
	}
}));

import SettingsPage from '../../../routes/pages/settings/+page.svelte';

const data = {
	isAuthenticated: false,
	githubOAuthConfigured: true,
	user: null,
	recentRepos: [],
	selectedBackend: {
		kind: 'local' as const,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		}
	},
	selectedRepo: null,
	activeDraftBranch: null,
	configs: [],
	blockConfigs: [],
	navigationManifest: {
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	},
	rootConfig: null,
	instructionDiscovery: {
		instructions: [],
		issues: []
	}
};

describe('routes/pages/settings/+page.svelte', () => {
	beforeEach(() => {
		settingsPageMocks.files['tentman.json'] = JSON.stringify({
			siteName: 'Docs',
			local: {
				previewUrl: 'http://localhost:5173/'
			}
		});
		settingsPageMocks.refresh.mockClear();
		settingsPageMocks.invalidate.mockClear();
		settingsPageMocks.localContentStore.set(settingsPageMocks.localContentReadyState);
	});

	it('updates the local preview port from site settings', async () => {
		const screen = await render(SettingsPage, { data });

		await expectElement(screen.getByLabelText('Preview port')).toHaveValue('5173');

		await screen.getByLabelText('Preview port').fill('4173');
		await screen.getByRole('button', { name: 'Save port' }).click();

		expect(JSON.parse(settingsPageMocks.files['tentman.json'])).toMatchObject({
			local: {
				previewUrl: 'http://localhost:4173/'
			}
		});
		expect(settingsPageMocks.refresh).toHaveBeenCalledWith({ force: true });
		expect(settingsPageMocks.invalidate).toHaveBeenCalledWith('app:content');
		await expectElement(screen.getByText('Local preview port updated.')).toBeVisible();
	});

	it('rejects Tentman app port as the local preview port', async () => {
		const screen = await render(SettingsPage, { data });

		await screen.getByLabelText('Preview port').fill('5174');
		await screen.getByRole('button', { name: 'Save port' }).click();

		await expectElement(
			screen.getByText('Use the site preview port, not the Tentman app port.')
		).toBeVisible();
		expect(JSON.parse(settingsPageMocks.files['tentman.json'])).toMatchObject({
			local: {
				previewUrl: 'http://localhost:5173/'
			}
		});
		expect(settingsPageMocks.refresh).not.toHaveBeenCalled();
	});
});
