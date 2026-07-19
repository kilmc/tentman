import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';

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
		},
		get() {
			return value;
		}
	};
}

const groupPageMocks = vi.hoisted(() => {
	const backend = {
		kind: 'local' as const,
		cacheKey: 'local:docs',
		label: 'Local docs',
		supportsDraftBranches: false
	};
	const configEntry = {
		slug: 'projects',
		path: 'tentman/configs/projects.tentman.json',
		config: {
			type: 'content' as const,
			_tentmanId: 'projects',
			id: 'projects',
			label: 'Projects',
			collection: {
				groupManagement: true,
				groups: [
					{ _tentmanId: 'identity', label: 'Identity', value: 'identity' },
					{ _tentmanId: 'campaigns', label: 'Campaigns', value: 'campaigns' }
				]
			},
			content: {
				mode: 'file' as const,
				path: 'src/content/projects.json'
			},
			blocks: []
		}
	};
	const content = [
		{ _tentmanId: 'brand-system', title: 'Brand system', _tentmanGroupId: 'identity' },
		{ _tentmanId: 'launch', title: 'Launch', _tentmanGroupId: 'campaigns' },
		{ _tentmanId: 'archive', title: 'Archive' }
	];
	const localContentState = {
		status: 'ready' as const,
		backendKey: 'local:docs',
		configs: [configEntry],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1 as const,
				collections: {
					projects: {
						items: ['brand-system', 'launch', 'archive'],
						groups: [
							{
								id: 'identity',
								label: 'Identity',
								value: 'identity',
								items: ['brand-system']
							},
							{
								id: 'campaigns',
								label: 'Campaigns',
								value: 'campaigns',
								items: ['launch']
							}
						]
					}
				}
			},
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		},
		error: null
	};
	const localRepoStore = createStoreState({
		status: 'ready' as const,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		backend,
		error: null
	});
	const localContentStore = createStoreState(localContentState);

	return {
		backend,
		configEntry,
		localContentState,
		localRepoStore,
		localContentStore,
		content,
		fetchContentDocument: vi.fn(async () => content),
		manageCollectionGroups: vi.fn(async () => localContentState.navigationManifest.manifest),
		refresh: vi.fn(async () => {}),
		goto: vi.fn(async () => {}),
		invalidate: vi.fn(async () => {}),
		resolve: vi.fn((path: string) => path),
		fetch: vi.fn(async () =>
			Response.json({
				branchName: 'tentman-preview',
				navigationManifest: {
					path: 'tentman/navigation-manifest.json',
					exists: true,
					manifest: {
						version: 1,
						collections: {
							projects: {
								items: ['brand-system', 'launch', 'archive'],
								groups: [
									{
										id: 'identity',
										label: 'Identity',
										value: 'identity',
										items: ['brand-system']
									},
									{
										id: 'campaigns',
										label: 'Campaigns',
										value: 'campaigns',
										items: ['launch']
									},
									{
										id: 'research',
										label: 'Research',
										value: 'research',
										items: []
									}
								]
							}
						}
					},
					error: null
				},
				changedPaths: [
					'tentman/configs/projects.tentman.json',
					'src/content/projects.json',
					'tentman/navigation-manifest.json'
				]
			})
		),
		invalidatePaths: vi.fn(async () => {}),
		warmCollection: vi.fn(async () => {}),
		patchCollectionGroups: vi.fn(async () => {}),
		setBranch: vi.fn(),
		toasts: {
			success: vi.fn(),
			error: vi.fn()
		}
	};
});

vi.mock('$app/navigation', () => ({
	goto: groupPageMocks.goto,
	invalidate: groupPageMocks.invalidate
}));

vi.mock('$app/paths', () => ({
	resolve: groupPageMocks.resolve
}));

vi.mock('$lib/content/service', () => ({
	fetchContentDocument: groupPageMocks.fetchContentDocument
}));

vi.mock('$lib/features/content-management/navigation-manifest', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('$lib/features/content-management/navigation-manifest')>();
	return {
		...original,
		manageCollectionGroups: groupPageMocks.manageCollectionGroups
	};
});

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: groupPageMocks.localContentStore.subscribe,
		refresh: groupPageMocks.refresh
	}
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: groupPageMocks.localRepoStore.subscribe
	}
}));

vi.mock('$lib/stores/github-repository-cache', () => ({
	githubRepositoryCache: {
		invalidatePaths: groupPageMocks.invalidatePaths,
		warmCollection: groupPageMocks.warmCollection,
		patchCollectionGroups: groupPageMocks.patchCollectionGroups
	}
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: {
		setBranch: groupPageMocks.setBranch
	}
}));

vi.mock('$lib/stores/toasts', () => ({
	toasts: groupPageMocks.toasts
}));

import GroupsPage from '../../../routes/pages/[page]/groups/+page.svelte';

function createLocalPageData(configEntry = groupPageMocks.configEntry) {
	return {
		selectedBackend: {
			kind: 'local' as const,
			repo: {
				name: 'Docs',
				pathLabel: '~/Docs'
			}
		},
		selectedRepo: null,
		discoveredConfig: configEntry,
		pageSlug: 'projects',
		navigationManifest: groupPageMocks.localContentState.navigationManifest,
		collectionNavigation: null
	};
}

function createGithubPageData() {
	return {
		selectedBackend: {
			kind: 'github' as const,
			repo: {
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs',
				default_branch: 'main'
			}
		},
		selectedRepo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'main'
		},
		discoveredConfig: groupPageMocks.configEntry,
		pageSlug: 'projects',
		navigationManifest: groupPageMocks.localContentState.navigationManifest,
		collectionNavigation: {
			items: [{ itemId: 'archive', title: 'Archive' }],
			groups: [
				{
					id: 'identity',
					label: 'Identity',
					items: [{ itemId: 'brand-system', title: 'Brand system' }]
				},
				{
					id: 'campaigns',
					label: 'Campaigns',
					items: [{ itemId: 'launch', title: 'Launch' }]
				}
			]
		}
	};
}

describe('routes/pages/[page]/groups/+page.svelte', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		groupPageMocks.localContentStore.set(groupPageMocks.localContentState);
		groupPageMocks.localRepoStore.set({
			status: 'ready',
			repo: {
				name: 'Docs',
				pathLabel: '~/Docs'
			},
			backend: groupPageMocks.backend,
			error: null
		});
		groupPageMocks.fetchContentDocument.mockClear();
		groupPageMocks.manageCollectionGroups.mockClear();
		groupPageMocks.refresh.mockClear();
		groupPageMocks.goto.mockClear();
		groupPageMocks.invalidate.mockClear();
		groupPageMocks.resolve.mockClear();
		groupPageMocks.fetch.mockClear();
		groupPageMocks.invalidatePaths.mockClear();
		groupPageMocks.warmCollection.mockClear();
		groupPageMocks.patchCollectionGroups.mockClear();
		groupPageMocks.setBranch.mockClear();
		groupPageMocks.toasts.success.mockClear();
		groupPageMocks.toasts.error.mockClear();
		vi.stubGlobal('fetch', groupPageMocks.fetch);
	});

	it('redirects local routes when group management is not enabled', async () => {
		const configEntry = {
			...groupPageMocks.configEntry,
			config: {
				...groupPageMocks.configEntry.config,
				collection: {
					groupManagement: false,
					groups: []
				}
			}
		};
		groupPageMocks.localContentStore.set({
			...groupPageMocks.localContentState,
			configs: [configEntry]
		});

		await render(GroupsPage, {
			data: createLocalPageData(configEntry)
		});

		await expect.poll(() => groupPageMocks.goto.mock.calls.length).toBeGreaterThan(0);
		expect(groupPageMocks.goto).toHaveBeenCalledWith('/pages/projects');
	});

	it('creates a group in local mode through the shared helper', async () => {
		const screen = await render(GroupsPage, {
			data: createLocalPageData()
		});

		await screen.getByLabelText('Label').fill('Research');
		await screen.getByLabelText('Value').fill('research');
		await screen.getByRole('button', { name: 'Create' }).click();

		await expect.poll(() => groupPageMocks.manageCollectionGroups.mock.calls.length).toBe(1);
		expect(groupPageMocks.manageCollectionGroups).toHaveBeenCalledWith(
			groupPageMocks.backend,
			expect.objectContaining({ slug: 'projects' }),
			{
				action: 'create',
				label: 'Research',
				value: 'research'
			},
			groupPageMocks.localContentState.navigationManifest.manifest,
			{
				message: 'Update Tentman navigation manifest'
			}
		);
		expect(groupPageMocks.refresh).toHaveBeenCalledWith({ force: true });
		expect(groupPageMocks.toasts.success).toHaveBeenCalledWith('Groups updated.');
	});

	it('edits a group label and value in local mode without changing identity', async () => {
		const screen = await render(GroupsPage, {
			data: createLocalPageData()
		});

		const identityGroup = screen
			.getByRole('heading', { name: 'Identity' })
			.element()
			.closest('section');
		expect(identityGroup).not.toBeNull();
		await expectElement(identityGroup).toHaveTextContent('identity · 1 items');
		await screen.getByRole('button', { name: 'Edit' }).first().click();
		await screen.getByRole('textbox', { name: 'Label' }).nth(1).fill('Studio Identity');
		await screen.getByRole('textbox', { name: 'Value' }).nth(1).fill('studio-identity');
		await screen.getByRole('button', { name: 'Save' }).click();

		await expect.poll(() => groupPageMocks.manageCollectionGroups.mock.calls.length).toBe(1);
		expect(groupPageMocks.manageCollectionGroups).toHaveBeenCalledWith(
			groupPageMocks.backend,
			expect.objectContaining({ slug: 'projects' }),
			{
				action: 'edit',
				groupId: 'identity',
				label: 'Studio Identity',
				value: 'studio-identity'
			},
			expect.anything(),
			expect.anything()
		);
	});

	it('deletes and unassigns a group in local mode', async () => {
		const screen = await render(GroupsPage, {
			data: createLocalPageData()
		});

		await screen.getByRole('button', { name: 'Delete' }).first().click();
		await expectElement(
			screen.getByText('Delete Identity and move its items to Ungrouped?')
		).toBeVisible();
		await screen.getByRole('button', { name: 'Delete' }).nth(1).click();

		await expect.poll(() => groupPageMocks.manageCollectionGroups.mock.calls.length).toBe(1);
		expect(groupPageMocks.manageCollectionGroups).toHaveBeenCalledWith(
			groupPageMocks.backend,
			expect.objectContaining({ slug: 'projects' }),
			{
				action: 'delete',
				groupId: 'identity'
			},
			expect.anything(),
			expect.anything()
		);
	});

	it('merges one group into another in local mode', async () => {
		const screen = await render(GroupsPage, {
			data: createLocalPageData()
		});

		await screen.getByRole('button', { name: 'Merge' }).first().click();
		await screen.getByLabelText('Merge Identity into').selectOptions('campaigns');
		await screen.getByRole('button', { name: 'Merge' }).nth(1).click();

		await expect.poll(() => groupPageMocks.manageCollectionGroups.mock.calls.length).toBe(1);
		expect(groupPageMocks.manageCollectionGroups).toHaveBeenCalledWith(
			groupPageMocks.backend,
			expect.objectContaining({ slug: 'projects' }),
			{
				action: 'merge',
				sourceGroupId: 'identity',
				targetGroupId: 'campaigns'
			},
			expect.anything(),
			expect.anything()
		);
	});

	it('invalidates returned changed paths after GitHub mutations', async () => {
		const screen = await render(GroupsPage, {
			data: createGithubPageData()
		});

		await screen.getByLabelText('Label').fill('Research');
		await screen.getByLabelText('Value').fill('research');
		await screen.getByRole('button', { name: 'Create' }).click();

		await expect.poll(() => groupPageMocks.fetch.mock.calls.length).toBe(1);
		expect(groupPageMocks.fetch).toHaveBeenCalledWith('/api/repo/navigation-manifest', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				action: 'manage-collection-groups',
				collection: 'projects',
				mutation: {
					action: 'create',
					label: 'Research',
					value: 'research'
				}
			})
		});
		expect(groupPageMocks.setBranch).toHaveBeenCalledWith('tentman-preview', 'acme/docs');
		expect(groupPageMocks.patchCollectionGroups).toHaveBeenCalledWith({
			slug: 'projects',
			mutation: {
				action: 'create',
				label: 'Research',
				value: 'research'
			},
			navigationManifest: expect.objectContaining({
				version: 1
			})
		});
		expect(groupPageMocks.invalidatePaths).not.toHaveBeenCalled();
		expect(groupPageMocks.warmCollection).toHaveBeenCalledWith('projects', {
			fetcher: groupPageMocks.fetch,
			force: true,
			hydrateRemaining: false,
			warmDocuments: false
		});
		expect(groupPageMocks.invalidate).toHaveBeenCalledWith('app:content');
	});
});
