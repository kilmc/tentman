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
				idField?: string;
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
		navigationManifest: {
			path: string;
			exists: boolean;
			manifest: unknown;
			error: string | null;
		};
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
		slug: 'posts',
		path: 'content/posts.json',
		config: {
			label: 'Posts',
			collection: true,
			idField: 'slug',
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
	url: new URL('http://localhost/pages/posts/hello-world/edit')
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
	deleteContentDocument: vi.fn(),
	fetchContentDocument: localFlowMocks.fetchContentDocument,
	saveContentDocument: localFlowMocks.saveContentDocument
}));

import ItemEditPage from '../../../routes/pages/[page]/[itemId]/edit/+page.svelte';

describe('routes/pages/[page]/[itemId]/edit/+page.svelte', () => {
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
		pageState.url = new URL('http://localhost/pages/posts/hello-world/edit');
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
				slug: 'hello-world',
				title: 'Updated post',
				body: '![Hero](draft-asset:hero)'
			},
			errors: []
		});
		localFlowMocks.fetchContentDocument.mockResolvedValue([
			{
				slug: 'hello-world',
				title: 'Hello world',
				body: 'Original body'
			}
		]);
		localFlowMocks.materializeDraftAssets.mockResolvedValue({
			content: {
				slug: 'hello-world',
				title: 'Updated post',
				body: '![Hero](/images/hero-asset.png)'
			},
			fileChanges: [],
			cleanedRefs: ['draft-asset:hero']
		});
		localFlowMocks.saveContentDocument.mockResolvedValue(undefined);
		localFlowMocks.deleteDraftAsset.mockResolvedValue(undefined);
		localFlowMocks.goto.mockResolvedValue(undefined);
	});

	it('cleans up staged assets after a successful local item save', async () => {
		const screen = await render(ItemEditPage, {
			data: {
				mode: 'local',
				pageSlug: 'posts',
				itemId: 'hello-world',
				discoveredConfig: null,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				item: null,
				contentError: null,
				navigationManifest: null,
				rootConfig: null,
				branch: null
			},
			form: undefined as never
		});

		await expectElement(screen.getByTestId('mock-form-generator')).toBeInTheDocument();

		await screen.getByRole('button', { name: 'Save Changes' }).click();

		await expect.poll(() => localFlowMocks.saveContentDocument.mock.calls.length).toBe(1);
		expect(localFlowMocks.saveContentDocument).toHaveBeenCalledWith(
			localFlowMocks.backend,
			localFlowMocks.discoveredConfig.config,
			localFlowMocks.discoveredConfig.path,
			{
				slug: 'hello-world',
				title: 'Updated post',
				body: '![Hero](/images/hero-asset.png)'
			},
			{ itemId: 'hello-world' }
		);
		expect(localFlowMocks.deleteDraftAsset).toHaveBeenCalledWith('draft-asset:hero');
		expect(localFlowMocks.goto).toHaveBeenCalledWith(
			'/pages/posts/hello-world/edit?published=true'
		);
	});

	it('recovers unsaved local item edits after interruption', async () => {
		localStorage.setItem(
			'tentman:editor-recovery:v1:/pages/posts/hello-world/edit',
			JSON.stringify({
				version: 1,
				routeKey: '/pages/posts/hello-world/edit',
				contextKey: 'local:local:docs',
				baselineFingerprint: JSON.stringify({
					slug: 'hello-world',
					title: 'Hello world',
					body: 'Original body'
				}),
				recoveredAt: 123,
				session: {
					data: {
						title: 'Recovered hello world'
					},
					baseline: {
						title: 'Hello world'
					},
					panelStack: []
				}
			})
		);
		setMockFormGeneratorResult({
			data: {
				title: 'Hello world'
			},
			errors: []
		});

		const screen = await render(ItemEditPage, {
			data: {
				mode: 'local',
				pageSlug: 'posts',
				itemId: 'hello-world',
				discoveredConfig: null,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				item: null,
				contentError: null,
				navigationManifest: null,
				rootConfig: null,
				branch: null
			},
			form: undefined as never
		});

		await expectElement(screen.getByText('Local recovery available')).toBeVisible();
		await screen.getByRole('button', { name: 'Recover changes' }).click();
		await expectElement(screen.getByTestId('mock-form-data')).toHaveTextContent(
			'Recovered hello world'
		);
	});
});
