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
	type EnhanceResultType = 'success' | 'redirect' | 'failure' | 'error';
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
				_tentmanId?: string;
				collection:
					| boolean
					| {
							ordering?: boolean;
							groupManagement?: boolean;
							groups?: Array<{ _tentmanId: string; label: string; value?: string }>;
					  };
				idField?: string;
				blocks: Array<Record<string, unknown>>;
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
	type EnhanceSubmit = (input: {
		formData: FormData;
		cancel: () => void;
	}) => Promise<
		| ((input: {
				update: () => Promise<void>;
				result: { type: EnhanceResultType };
		  }) => Promise<void>)
		| void
	>;

	const backend = {
		kind: 'local' as const,
		cacheKey: 'local:docs',
		label: 'Local docs',
		supportsDraftBranches: false
	};
	const discoveredConfig: LocalContentState['configs'][number] = {
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
		syncCollectionItemGroupSelection: vi.fn(),
		deleteDraftAsset: vi.fn(),
		invalidate: vi.fn(),
		invalidatePaths: vi.fn(),
		warmCollection: vi.fn(),
		goto: vi.fn(),
		resolve: vi.fn((path: string) => path),
		beforeNavigateCallbacks: [] as Array<(navigation: { cancel: () => void }) => void>,
		enhanceResult: { type: 'redirect' as EnhanceResultType },
		enhanceUpdate: vi.fn(async () => undefined),
		createEnhanceAction: (form: HTMLFormElement, submit?: EnhanceSubmit) => {
			const handleSubmit = async (event: SubmitEvent) => {
				event.preventDefault();
				const formData = new FormData(form);
				const cancelled = { value: false };
				const callback = await submit?.({
					formData,
					cancel: () => {
						cancelled.value = true;
					}
				});

				if (cancelled.value || !callback) {
					return;
				}

				await callback({
					update: localFlowMocks.enhanceUpdate,
					result: localFlowMocks.enhanceResult
				});
			};

			form.addEventListener('submit', handleSubmit);
			return {
				destroy() {
					form.removeEventListener('submit', handleSubmit);
				}
			};
		}
	};
});

const pageState = vi.hoisted(() => ({
	url: new URL('http://localhost/pages/posts/hello-world/edit')
}));

vi.mock('$app/forms', () => ({
	enhance: localFlowMocks.createEnhanceAction
}));

vi.mock('$app/state', () => ({
	page: pageState
}));

vi.mock('$app/navigation', () => ({
	goto: localFlowMocks.goto,
	invalidate: localFlowMocks.invalidate,
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

vi.mock('$lib/features/content-management/navigation-manifest', async () => {
	const actual = await vi.importActual<object>(
		'$lib/features/content-management/navigation-manifest'
	);
	return {
		...actual,
		syncCollectionItemGroupSelection: localFlowMocks.syncCollectionItemGroupSelection
	};
});

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

vi.mock('$lib/stores/github-repository-cache', () => ({
	githubRepositoryCache: {
		invalidatePaths: localFlowMocks.invalidatePaths,
		warmCollection: localFlowMocks.warmCollection
	}
}));

import ItemEditPage from '../../../routes/pages/[page]/[itemId]/edit/+page.svelte';
import { syncCollectionItemGroupSelection } from '$lib/features/content-management/navigation-manifest';

describe('routes/pages/[page]/[itemId]/edit/+page.svelte', () => {
	beforeEach(() => {
		localStorage.clear();
		localFlowMocks.refresh.mockClear();
		localFlowMocks.materializeDraftAssets.mockReset();
		localFlowMocks.fetchContentDocument.mockReset();
		localFlowMocks.saveContentDocument.mockReset();
		localFlowMocks.syncCollectionItemGroupSelection.mockReset();
		localFlowMocks.deleteDraftAsset.mockReset();
		localFlowMocks.invalidate.mockReset();
		localFlowMocks.invalidatePaths.mockReset();
		localFlowMocks.warmCollection.mockReset();
		localFlowMocks.enhanceUpdate.mockClear();
		localFlowMocks.goto.mockReset();
		localFlowMocks.resolve.mockClear();
		localFlowMocks.beforeNavigateCallbacks = [];
		localFlowMocks.enhanceResult = { type: 'redirect' };
		delete localFlowMocks.discoveredConfig.config._tentmanId;
		localFlowMocks.discoveredConfig.config.collection = true;
		localFlowMocks.discoveredConfig.config.blocks = [];
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
		localFlowMocks.syncCollectionItemGroupSelection.mockResolvedValue(null);
		localFlowMocks.deleteDraftAsset.mockResolvedValue(undefined);
		localFlowMocks.invalidatePaths.mockResolvedValue(undefined);
		localFlowMocks.warmCollection.mockResolvedValue(undefined);
		localFlowMocks.invalidate.mockResolvedValue(undefined);
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

	it('syncs local item group selection into the navigation manifest after saving', async () => {
		localFlowMocks.discoveredConfig.config._tentmanId = 'posts';
		localFlowMocks.discoveredConfig.config.collection = {
			groupManagement: true,
			groups: [{ _tentmanId: 'featured', label: 'Featured', value: 'featured' }]
		};
		localFlowMocks.discoveredConfig.config.blocks = [
			{ id: 'title', type: 'text', label: 'Title' },
			{ type: 'tentmanGroup', collection: 'posts', label: 'Group' }
		];
		setMockFormGeneratorResult({
			data: {
				slug: 'hello-world',
				title: 'Updated post',
				_tentmanGroupId: 'featured'
			},
			errors: []
		});
		localFlowMocks.materializeDraftAssets.mockResolvedValue({
			content: {
				slug: 'hello-world',
				title: 'Updated post',
				_tentmanGroupId: 'featured'
			},
			fileChanges: [],
			cleanedRefs: []
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

		await screen.getByTestId('mock-form-dirty').click();
		await screen.getByRole('button', { name: 'Save Changes' }).click();

		await expect.poll(() => localFlowMocks.saveContentDocument.mock.calls.length).toBe(1);
		expect(syncCollectionItemGroupSelection).toHaveBeenCalledWith(
			localFlowMocks.backend,
			expect.objectContaining({ slug: 'posts' }),
			{
				slug: 'hello-world',
				title: 'Updated post',
				_tentmanGroupId: 'featured'
			},
			null,
			{ message: 'Update Tentman navigation manifest' }
		);
	});

	it('refreshes GitHub navigation after saving a group-managed collection without ordering', async () => {
		const discoveredConfig = {
			slug: 'posts',
			path: 'content/posts.tentman.json',
			config: {
				label: 'Posts',
				_tentmanId: 'posts',
				collection: {
					groupManagement: true,
					groups: [{ _tentmanId: 'featured', label: 'Featured', value: 'featured' }]
				},
				idField: 'slug',
				blocks: [
					{ id: 'title', type: 'text', label: 'Title' },
					{ type: 'tentmanGroup', collection: 'posts', label: 'Group' }
				],
				content: {
					mode: 'file',
					path: './posts.json'
				}
			}
		};
		setMockFormGeneratorResult({
			data: {
				slug: 'hello-world',
				title: 'Updated post',
				_tentmanGroupId: 'featured'
			},
			errors: []
		});

		const screen = await render(ItemEditPage, {
			data: {
				mode: 'github',
				pageSlug: 'posts',
				itemId: 'hello-world',
				discoveredConfig,
				blockConfigs: [],
				packageBlocks: [],
				blockRegistryError: null,
				item: {
					slug: 'hello-world',
					title: 'Hello world'
				},
				contentError: null,
				navigationManifest: {
					path: 'tentman/navigation-manifest.json',
					exists: true,
					manifest: {
						version: 1,
						collections: {
							posts: {
								items: ['hello-world'],
								groups: [{ id: 'featured', items: [] }]
							}
						}
					},
					error: null
				},
				rootConfig: null,
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				},
				branch: 'tentman-preview'
			},
			form: undefined as never
		});

		await screen.getByTestId('mock-form-dirty').click();
		await screen.getByRole('button', { name: 'Save Changes' }).click();

		await expect.poll(() => localFlowMocks.invalidatePaths.mock.calls.length).toBe(1);
		expect(localFlowMocks.invalidatePaths).toHaveBeenCalledWith([
			'content/posts.json',
			'tentman/navigation-manifest.json'
		]);
		expect(localFlowMocks.enhanceUpdate).toHaveBeenCalled();
		expect(localFlowMocks.warmCollection).toHaveBeenCalledWith('posts', {
			fetcher: expect.any(Function),
			force: true
		});
		expect(localFlowMocks.invalidate).toHaveBeenCalledWith('app:content');
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
