import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import { setMockFormGeneratorResult } from '$lib/test/mock-form-generator';

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

const localFlowMocks = vi.hoisted(() => {
	type LocalRepoState = {
		status: 'ready';
		repo: { name: string; pathLabel: string };
		backend: {
			kind: 'local';
			cacheKey: string;
			label: string;
			supportsDraftBranches: boolean;
		};
		error: string | null;
	};
	type LocalContentState = {
		status: 'idle' | 'ready';
		backendKey: string | null;
		configs: Array<{
			slug: string;
			path: string;
			config: {
				label: string;
				collection: boolean;
				blocks: unknown[];
				content: {
					mode: string;
				};
			};
		}>;
		blockConfigs: unknown[];
		blockRegistry: unknown;
		blockRegistryError: string | null;
		rootConfig: unknown;
		navigationManifest: unknown;
		instructionDiscovery: unknown;
		error: string | null;
	};

	const backend = {
		kind: 'local' as const,
		cacheKey: 'local:docs',
		label: 'Local docs',
		supportsDraftBranches: false
	};
	const discoveredConfig = {
		slug: 'about',
		path: 'content/about.json',
		config: {
			label: 'About',
			collection: false,
			blocks: [],
			content: {
				mode: 'file'
			}
		}
	};
	const localRepoStore = createStoreState<LocalRepoState>({
		status: 'ready',
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		backend,
		error: null
	});
	const localContentStore = createStoreState<LocalContentState>({
		status: 'idle',
		backendKey: null,
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
	});

	return {
		backend,
		discoveredConfig,
		localRepoStore,
		localContentStore,
		refresh: vi.fn(async (_options?: { force?: boolean }) => {
			localContentStore.set({
				status: 'ready',
				backendKey: 'local:docs',
				configs: [discoveredConfig],
				blockConfigs: [],
				blockRegistry: {} as never,
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
			});
		}),
		materializeDraftAssets: vi.fn(),
		fetchContentDocument: vi.fn(),
		saveContentDocument: vi.fn(),
		deleteDraftAsset: vi.fn(),
		goto: vi.fn(),
		resolve: vi.fn((path: string) => path),
		beforeNavigateCallbacks: [] as Array<(navigation: { cancel: () => void }) => void>
	};
});

const pageState = vi.hoisted(() => ({
	url: new URL('http://localhost/pages/about/edit')
}));

vi.mock('$app/forms', () => ({
	enhance: () => ({
		destroy() {}
	})
}));

vi.mock('$app/state', () => ({
	page: pageState
}));

vi.mock('$app/navigation', () => ({
	goto: localFlowMocks.goto,
	beforeNavigate: (callback: (navigation: { cancel: () => void }) => void) => {
		localFlowMocks.beforeNavigateCallbacks.push(callback);
	}
}));

vi.mock('$app/paths', () => ({
	resolve: localFlowMocks.resolve
}));

vi.mock('$lib/utils/keyboard', () => ({
	registerKeyboardShortcuts: () => () => {},
	formatShortcut: (shortcut: string) => shortcut
}));

vi.mock('$lib/components/form/FormGenerator.svelte', async () => ({
	default: (await import('$lib/test/fixtures/MockFormGenerator.svelte')).default
}));

vi.mock('$lib/features/draft-assets/materialize', () => ({
	materializeDraftAssets: localFlowMocks.materializeDraftAssets
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		delete: localFlowMocks.deleteDraftAsset
	}
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: localFlowMocks.localContentStore.subscribe,
		refresh: localFlowMocks.refresh
	}
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: localFlowMocks.localRepoStore.subscribe
	}
}));

vi.mock('$lib/content/service', () => ({
	fetchContentDocument: localFlowMocks.fetchContentDocument,
	saveContentDocument: localFlowMocks.saveContentDocument
}));

import PageEditPage from '../../../routes/pages/[page]/edit/+page.svelte';

describe('routes/pages/[page]/edit/+page.svelte', () => {
	beforeEach(() => {
		localStorage.clear();
		localFlowMocks.refresh.mockClear();
		localFlowMocks.materializeDraftAssets.mockReset();
		localFlowMocks.fetchContentDocument.mockReset();
		localFlowMocks.saveContentDocument.mockReset();
		localFlowMocks.deleteDraftAsset.mockReset();
		localFlowMocks.goto.mockReset();
		localFlowMocks.resolve.mockClear();
		localFlowMocks.beforeNavigateCallbacks = [];
		pageState.url = new URL('http://localhost/pages/about/edit');
		localFlowMocks.localContentStore.set({
			status: 'idle',
			backendKey: null,
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
		});
		setMockFormGeneratorResult({
			data: {
				title: 'Updated about',
				body: '![Hero](draft-asset:hero)'
			},
			errors: []
		});
		localFlowMocks.fetchContentDocument.mockResolvedValue({
			title: 'About',
			body: 'Original body'
		});
		localFlowMocks.materializeDraftAssets.mockResolvedValue({
			content: {
				title: 'Updated about',
				body: '![Hero](/images/hero-asset.png)'
			},
			fileChanges: [],
			cleanedRefs: ['draft-asset:hero']
		});
		localFlowMocks.saveContentDocument.mockResolvedValue(undefined);
		localFlowMocks.deleteDraftAsset.mockResolvedValue(undefined);
		localFlowMocks.goto.mockResolvedValue(undefined);
	});

	it('cleans up staged assets after a successful local page save', async () => {
		const screen = await render(PageEditPage, {
			data: {
				mode: 'local',
				pageSlug: 'about',
				discoveredConfig: null,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				content: null,
				contentError: null,
				branch: null
			},
			form: undefined as never
		});

		await expectElement(screen.getByTestId('mock-form-generator')).toBeInTheDocument();
		const saveButton = screen.getByRole('button', { name: 'Save Changes' });
		await expectElement(saveButton).toBeDisabled();
		await expectElement(screen.getByRole('link', { name: 'Cancel' })).not.toBeInTheDocument();

		await screen.getByTestId('mock-form-dirty').click();
		await expectElement(saveButton).toBeEnabled();
		await saveButton.click();

		await expect.poll(() => localFlowMocks.saveContentDocument.mock.calls.length).toBe(1);
		expect(localFlowMocks.saveContentDocument).toHaveBeenCalledWith(
			localFlowMocks.backend,
			localFlowMocks.discoveredConfig.config,
			localFlowMocks.discoveredConfig.path,
			{
				title: 'Updated about',
				body: '![Hero](/images/hero-asset.png)'
			}
		);
		expect(localFlowMocks.deleteDraftAsset).toHaveBeenCalledWith('draft-asset:hero');
		expect(localFlowMocks.goto).toHaveBeenCalledWith('/pages/about/edit?published=true');
	});

	it('recovers unsaved local page edits after interruption', async () => {
		localStorage.setItem(
			'tentman:editor-recovery:v1:/pages/about/edit',
			JSON.stringify({
				version: 1,
				routeKey: '/pages/about/edit',
				contextKey: 'local:local:docs',
				baselineFingerprint: JSON.stringify({
					title: 'About',
					body: 'Original body'
				}),
				recoveredAt: 123,
				session: {
					data: {
						title: 'Recovered about'
					},
					baseline: {
						title: 'About'
					},
					panelStack: []
				}
			})
		);
		setMockFormGeneratorResult({
			data: {
				title: 'About'
			},
			errors: []
		});

		const screen = await render(PageEditPage, {
			data: {
				mode: 'local',
				pageSlug: 'about',
				discoveredConfig: null,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				content: null,
				contentError: null,
				branch: null
			},
			form: undefined as never
		});

		await expectElement(screen.getByText('Local recovery available')).toBeVisible();
		await screen.getByRole('button', { name: 'Recover changes' }).click();
		await expectElement(screen.getByTestId('mock-form-data')).toHaveTextContent('Recovered about');
	});
});
