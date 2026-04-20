import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
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
		slug: 'posts',
		path: 'content/posts.json',
		config: {
			label: 'Posts',
			collection: true,
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
		createContentDocument: vi.fn(),
		deleteDraftAsset: vi.fn(),
		goto: vi.fn(),
		resolve: vi.fn((path: string) => path),
		beforeNavigateCallbacks: [] as Array<(navigation: { cancel: () => void }) => void>
	};
});

vi.mock('$app/forms', () => ({
	enhance: () => ({
		destroy() {}
	})
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
	createContentDocument: localFlowMocks.createContentDocument
}));

import NewItemPage from '../../../routes/pages/[page]/new/+page.svelte';

describe('routes/pages/[page]/new/+page.svelte', () => {
	beforeEach(() => {
		localFlowMocks.refresh.mockClear();
		localFlowMocks.materializeDraftAssets.mockReset();
		localFlowMocks.createContentDocument.mockReset();
		localFlowMocks.deleteDraftAsset.mockReset();
		localFlowMocks.goto.mockReset();
		localFlowMocks.resolve.mockClear();
		localFlowMocks.beforeNavigateCallbacks = [];
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
				title: 'Hello world',
				body: '![Hero](draft-asset:hero)'
			},
			errors: []
		});
		localFlowMocks.materializeDraftAssets.mockResolvedValue({
			content: {
				title: 'Hello world',
				body: '![Hero](/images/hero-asset.png)'
			},
			fileChanges: [],
			cleanedRefs: ['draft-asset:hero']
		});
		localFlowMocks.createContentDocument.mockResolvedValue(undefined);
		localFlowMocks.deleteDraftAsset.mockResolvedValue(undefined);
		localFlowMocks.goto.mockResolvedValue(undefined);
	});

	it('cleans up staged assets after a successful local create flow', async () => {
		const screen = render(NewItemPage, {
			data: {
				mode: 'local',
				pageSlug: 'posts',
				discoveredConfig: null,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				branch: null
			},
			form: undefined as never
		});

		await expect.element(screen.getByTestId('mock-form-generator')).toBeInTheDocument();

		await screen.getByRole('button', { name: 'Create Item' }).click();

		await expect.poll(() => localFlowMocks.materializeDraftAssets.mock.calls.length).toBe(1);
		expect(localFlowMocks.materializeDraftAssets).toHaveBeenCalledWith({
			backend: localFlowMocks.backend,
			content: {
				title: 'Hello world',
				body: '![Hero](draft-asset:hero)'
			}
		});
		expect(localFlowMocks.createContentDocument).toHaveBeenCalledWith(
			localFlowMocks.backend,
			localFlowMocks.discoveredConfig.config,
			localFlowMocks.discoveredConfig.path,
			{
				title: 'Hello world',
				body: '![Hero](/images/hero-asset.png)'
			},
			undefined
		);
		expect(localFlowMocks.deleteDraftAsset).toHaveBeenCalledWith('draft-asset:hero');
		expect(localFlowMocks.refresh).toHaveBeenNthCalledWith(2, { force: true });
		expect(localFlowMocks.goto).toHaveBeenCalledWith('/pages/posts?published=true');
		expect(localFlowMocks.deleteDraftAsset.mock.invocationCallOrder[0]).toBeGreaterThan(
			localFlowMocks.createContentDocument.mock.invocationCallOrder[0]
		);
	});

	it('shows dirty state from the form session and blocks navigation when discarded', async () => {
		const screen = render(NewItemPage, {
			data: {
				mode: 'local',
				pageSlug: 'posts',
				discoveredConfig: null,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				branch: null
			},
			form: undefined as never
		});

		await expect.element(screen.getByText('Unsaved changes')).not.toBeInTheDocument();

		await screen.getByTestId('mock-form-dirty').click();

		await expect.element(screen.getByText('Unsaved changes')).toBeVisible();

		const cancel = vi.fn();
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		localFlowMocks.beforeNavigateCallbacks.at(-1)?.({ cancel });

		expect(confirm).toHaveBeenCalledWith(
			'You have unsaved changes. Are you sure you want to leave?'
		);
		expect(cancel).toHaveBeenCalled();
		confirm.mockRestore();
	});
});
