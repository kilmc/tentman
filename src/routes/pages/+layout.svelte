<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { get } from 'svelte/store';
	import {
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		SHADOW_PLACEHOLDER_ITEM_ID,
		dragHandle,
		dragHandleZone,
		type DndEvent
	} from 'svelte-dnd-action';
	import type { LayoutData } from './$types';
	import type { DiscoveredConfig } from '$lib/config/discovery';
	import { fetchContentDocument } from '$lib/content/service';
	import {
		areNavigationDraftsEqual,
		cloneNavigationDraft,
		createNavigationDraft,
		serializeNavigationDraft,
		setNavigationDraftCollection,
		setNavigationDraftContentOrder,
		type NavigationDraft,
		type NavigationDraftCollection
	} from '$lib/features/content-management/navigation-draft';
	import {
		getConfigItemLabel,
		getOrderedCollectionNavigation,
		orderDiscoveredConfigs,
		type OrderedCollectionNavigation
	} from '$lib/features/content-management/navigation';
	import {
		getManualNavigationSetupState,
		writeNavigationManifest
	} from '$lib/features/content-management/navigation-manifest';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { toasts } from '$lib/stores/toasts';
	import { buildLoginRedirect } from '$lib/utils/routing';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	type CollectionItemsBySlug = Record<string, OrderedCollectionNavigation>;
	type CollectionLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
	type SortableItem = {
		id: string;
		title: string;
		isDndShadowItem?: boolean;
	};
	type SortableConfigItem = {
		id: string;
		slug: string;
		label: string;
		isCollection: boolean;
		isDndShadowItem?: boolean;
	};
	type CollectionEditorState = {
		ungroupedItems: SortableItem[];
		groupItemsById: Record<string, SortableItem[]>;
	};

	const flipDurationMs = 150;
	const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

	let localCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionLoadStatusBySlug = $state<Record<string, CollectionLoadStatus>>({});
	let githubCollectionErrorBySlug = $state<Record<string, string | null>>({});
	let collectionLoadRequest = 0;
	let expandedCollections = $state<Record<string, boolean>>({});
	let isEditingNavigation = $state(false);
	let preparingNavigationEditor = $state(false);
	let savingNavigation = $state(false);
	let navigationDraft = $state<NavigationDraft | null>(null);
	let initialNavigationDraft = $state<NavigationDraft | null>(null);
	let topLevelEditorItems = $state<SortableConfigItem[]>([]);
	let collectionEditorStateByConfigId = $state<Record<string, CollectionEditorState>>({});

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const manifestState = $derived(
		isLocalMode ? $localContent.navigationManifest : data.navigationManifest
	);
	const availableConfigs = $derived(isLocalMode ? $localContent.configs : data.configs);
	const navigationManifest = $derived(manifestState.manifest);
	const configs = $derived(orderDiscoveredConfigs(availableConfigs, navigationManifest));
	const setup = $derived(getManualNavigationSetupState(availableConfigs, manifestState));
	const collectionItemsBySlug = $derived(
		isLocalMode ? localCollectionItemsBySlug : githubCollectionItemsBySlug
	);
	const currentPageSlug = $derived(page.params.page ?? null);
	const currentItemId = $derived(page.params.itemId ?? null);
	const canEditNavigation = $derived(setup.status === 'active' && manifestState.manifest !== null);
	const hasUnsavedNavigationChanges = $derived(
		isEditingNavigation &&
			navigationDraft !== null &&
			initialNavigationDraft !== null &&
			!areNavigationDraftsEqual(navigationDraft, initialNavigationDraft)
	);

	function isCollectionExpanded(slug: string) {
		if (isEditingNavigation) {
			return expandedCollections[slug] ?? false;
		}

		return expandedCollections[slug] ?? currentPageSlug === slug;
	}

	function getGitHubCollectionStatus(slug: string): CollectionLoadStatus {
		return githubCollectionLoadStatusBySlug[slug] ?? 'idle';
	}

	function getGitHubCollectionError(slug: string): string | null {
		return githubCollectionErrorBySlug[slug] ?? null;
	}

	function getCollectionSetup(slug: string) {
		return setup.collections.find((collection) => collection.slug === slug) ?? null;
	}

	function getCollectionItems(slug: string) {
		return (
			collectionItemsBySlug[slug] ?? {
				items: [],
				groups: []
			}
		);
	}

	function getFlatCollectionItemCount(slug: string) {
		const navigation = getCollectionItems(slug);
		return (
			navigation.items.length +
			navigation.groups.reduce((count, group) => count + group.items.length, 0)
		);
	}

	function isShadowItem(item: { id: string } & Record<string, unknown>) {
		return (
			item.id === SHADOW_PLACEHOLDER_ITEM_ID || item[SHADOW_ITEM_MARKER_PROPERTY_NAME] === true
		);
	}

	function sanitizeSortableItems<T extends { id: string } & Record<string, unknown>>(
		items: T[]
	): T[] {
		return items.filter((item) => !isShadowItem(item));
	}

	function getConfigById(configId: string) {
		return configs.find((config) => config.config.id === configId) ?? null;
	}

	function getCollectionItemTitleMap(slug: string): Map<string, string> {
		const navigation = collectionItemsBySlug[slug];
		if (!navigation) {
			return new Map();
		}

		return new Map(
			[...navigation.groups.flatMap((group) => group.items), ...navigation.items].map((item) => [
				item.itemId,
				item.title
			])
		);
	}

	function createSortableItem(itemId: string, titleMap: Map<string, string>): SortableItem {
		return {
			id: itemId,
			title: titleMap.get(itemId) ?? itemId
		};
	}

	function buildTopLevelEditorItems(draft: NavigationDraft): SortableConfigItem[] {
		const orderedItems = draft.contentOrder.flatMap((configId) => {
			const config = getConfigById(configId);
			if (!config || !config.config.id) {
				return [];
			}

			return [
				{
					id: config.config.id,
					slug: config.slug,
					label: config.config.label,
					isCollection: !!config.config.collection
				}
			];
		});

		const seenIds = new Set(orderedItems.map((item) => item.id));

		for (const config of configs) {
			if (!config.config.id || seenIds.has(config.config.id)) {
				continue;
			}

			orderedItems.push({
				id: config.config.id,
				slug: config.slug,
				label: config.config.label,
				isCollection: !!config.config.collection
			});
		}

		return orderedItems;
	}

	function buildCollectionEditorState(
		config: DiscoveredConfig,
		draftCollection: NavigationDraftCollection
	): CollectionEditorState {
		const titleMap = getCollectionItemTitleMap(config.slug);

		return {
			ungroupedItems: draftCollection.ungroupedItems.map((itemId) =>
				createSortableItem(itemId, titleMap)
			),
			groupItemsById: Object.fromEntries(
				draftCollection.groups.map((group) => [
					group.id,
					group.items.map((itemId) => createSortableItem(itemId, titleMap))
				])
			)
		};
	}

	function initializeNavigationEditorState(draft: NavigationDraft) {
		topLevelEditorItems = buildTopLevelEditorItems(draft);
		collectionEditorStateByConfigId = Object.fromEntries(
			configs.flatMap((config) => {
				if (!config.config.id) {
					return [];
				}

				const collectionDraft = draft.collections[config.config.id];
				if (!collectionDraft) {
					return [];
				}

				return [[config.config.id, buildCollectionEditorState(config, collectionDraft)] as const];
			})
		);
	}

	function syncTopLevelDraft(items: SortableConfigItem[]) {
		if (!navigationDraft) {
			return;
		}

		navigationDraft = setNavigationDraftContentOrder(
			navigationDraft,
			sanitizeSortableItems(items).map((item) => item.id)
		);
	}

	function syncCollectionDraft(configId: string) {
		if (!navigationDraft) {
			return;
		}

		const collectionDraft = navigationDraft.collections[configId];
		const editorState = collectionEditorStateByConfigId[configId];

		if (!collectionDraft || !editorState) {
			return;
		}

		navigationDraft = setNavigationDraftCollection(navigationDraft, configId, {
			ungroupedItems: sanitizeSortableItems(editorState.ungroupedItems).map((item) => item.id),
			groups: collectionDraft.groups.map((group) => ({
				...group,
				items: sanitizeSortableItems(editorState.groupItemsById[group.id] ?? []).map(
					(item) => item.id
				)
			}))
		});
	}

	function updateCollectionEditorState(configId: string, nextState: CollectionEditorState) {
		collectionEditorStateByConfigId = {
			...collectionEditorStateByConfigId,
			[configId]: nextState
		};

		syncCollectionDraft(configId);
	}

	function getDraftCollection(configId: string | null | undefined) {
		if (!configId || !navigationDraft) {
			return null;
		}

		return navigationDraft.collections[configId] ?? null;
	}

	function getEditorCollectionState(configId: string | null | undefined) {
		if (!configId) {
			return null;
		}

		return collectionEditorStateByConfigId[configId] ?? null;
	}

	function toggleCollection(config: DiscoveredConfig) {
		const nextExpanded = !isCollectionExpanded(config.slug);

		expandedCollections = {
			...expandedCollections,
			[config.slug]: nextExpanded
		};

		if (!isLocalMode && nextExpanded) {
			void loadGitHubCollectionItems(config);
		}
	}

	async function redirectToLoginForExpiredSession() {
		window.location.assign(buildLoginRedirect(resolve('/auth/login'), window.location));
	}

	async function loadGitHubCollectionItems(
		config: DiscoveredConfig,
		options?: { force?: boolean }
	) {
		if (isLocalMode || !config.config.collection) {
			return;
		}

		const status = getGitHubCollectionStatus(config.slug);
		if (!options?.force && (status === 'loading' || status === 'ready')) {
			return;
		}

		githubCollectionLoadStatusBySlug = {
			...githubCollectionLoadStatusBySlug,
			[config.slug]: 'loading'
		};
		githubCollectionErrorBySlug = {
			...githubCollectionErrorBySlug,
			[config.slug]: null
		};

		try {
			const response = await fetch(
				`${resolve('/api/repo/collection-items')}?slug=${encodeURIComponent(config.slug)}`
			);

			if (response.status === 401) {
				await redirectToLoginForExpiredSession();
				return;
			}

			if (!response.ok) {
				throw new Error(`Failed to load collection items (${response.status})`);
			}

			const payload = (await response.json()) as OrderedCollectionNavigation;

			githubCollectionItemsBySlug = {
				...githubCollectionItemsBySlug,
				[config.slug]: {
					items: payload.items ?? [],
					groups: payload.groups ?? []
				}
			};
			githubCollectionLoadStatusBySlug = {
				...githubCollectionLoadStatusBySlug,
				[config.slug]: 'ready'
			};
		} catch (error) {
			githubCollectionLoadStatusBySlug = {
				...githubCollectionLoadStatusBySlug,
				[config.slug]: 'error'
			};
			githubCollectionErrorBySlug = {
				...githubCollectionErrorBySlug,
				[config.slug]: error instanceof Error ? error.message : 'Failed to load items'
			};
		}
	}

	async function loadLocalCollectionItems(availableConfigs: DiscoveredConfig[]) {
		const repoState = get(localRepo);
		if (!repoState.backend) {
			localCollectionItemsBySlug = {};
			return;
		}

		const requestId = ++collectionLoadRequest;
		const collectionEntries = await Promise.all(
			availableConfigs
				.filter((config) => config.config.collection)
				.map(async (config) => {
					try {
						const content = await fetchContentDocument(
							repoState.backend!,
							config.config,
							config.path
						);

						return [
							config.slug,
							getOrderedCollectionNavigation(config.config, content, navigationManifest)
						] as const;
					} catch (error) {
						console.error(`Failed to load local sidebar items for ${config.slug}:`, error);
						return [
							config.slug,
							{
								items: [],
								groups: []
							}
						] as const;
					}
				})
		);

		if (requestId !== collectionLoadRequest) {
			return;
		}

		localCollectionItemsBySlug = Object.fromEntries(collectionEntries);
	}

	async function ensureAllCollectionItemsLoaded() {
		if (isLocalMode) {
			if ($localContent.status !== 'ready') {
				await localContent.refresh({ force: true });
			}

			await loadLocalCollectionItems(configs);
			return;
		}

		await Promise.all(
			configs
				.filter((config) => config.config.collection)
				.map((config) => loadGitHubCollectionItems(config))
		);
	}

	async function startNavigationEditing() {
		if (!canEditNavigation || preparingNavigationEditor || savingNavigation) {
			return;
		}

		preparingNavigationEditor = true;

		try {
			await ensureAllCollectionItemsLoaded();

			const draft = createNavigationDraft(configs, navigationManifest, collectionItemsBySlug);
			navigationDraft = draft;
			initialNavigationDraft = cloneNavigationDraft(draft);
			initializeNavigationEditorState(draft);
			expandedCollections = {};
			isEditingNavigation = true;
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : 'Failed to prepare navigation editing.'
			);
		} finally {
			preparingNavigationEditor = false;
		}
	}

	function cancelNavigationEditing() {
		isEditingNavigation = false;
		navigationDraft = null;
		initialNavigationDraft = null;
		topLevelEditorItems = [];
		collectionEditorStateByConfigId = {};
	}

	async function saveNavigationEditing() {
		if (!navigationDraft || savingNavigation) {
			return;
		}

		savingNavigation = true;

		try {
			const manifest = serializeNavigationDraft(navigationDraft);

			if (isLocalMode) {
				const repoState = get(localRepo);
				if (!repoState.backend) {
					throw new Error('No local repository is open.');
				}

				await writeNavigationManifest(repoState.backend, manifest, {
					message: MANIFEST_COMMIT_MESSAGE
				});
				await localContent.refresh({ force: true });
			} else {
				const response = await fetch('/api/repo/navigation-manifest', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						action: 'save-manifest',
						manifest
					})
				});

				if (response.status === 401) {
					await redirectToLoginForExpiredSession();
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to save navigation manifest');
				}

				githubCollectionItemsBySlug = {};
				githubCollectionLoadStatusBySlug = {};
				githubCollectionErrorBySlug = {};
			}

			cancelNavigationEditing();
			await invalidateAll();
			toasts.success('Navigation saved.');
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to save navigation changes.');
		} finally {
			savingNavigation = false;
		}
	}

	function handleTopLevelConsider(event: CustomEvent<DndEvent<SortableConfigItem>>) {
		topLevelEditorItems = event.detail.items;
		syncTopLevelDraft(event.detail.items);
	}

	function handleTopLevelFinalize(event: CustomEvent<DndEvent<SortableConfigItem>>) {
		topLevelEditorItems = event.detail.items;
		syncTopLevelDraft(event.detail.items);
	}

	function handleCollectionUngroupedConsider(
		configId: string,
		event: CustomEvent<DndEvent<SortableItem>>
	) {
		const currentState = getEditorCollectionState(configId);
		if (!currentState) {
			return;
		}

		updateCollectionEditorState(configId, {
			...currentState,
			ungroupedItems: event.detail.items
		});
	}

	function handleCollectionUngroupedFinalize(
		configId: string,
		event: CustomEvent<DndEvent<SortableItem>>
	) {
		const currentState = getEditorCollectionState(configId);
		if (!currentState) {
			return;
		}

		updateCollectionEditorState(configId, {
			...currentState,
			ungroupedItems: event.detail.items
		});
	}

	function handleCollectionGroupConsider(
		configId: string,
		groupId: string,
		event: CustomEvent<DndEvent<SortableItem>>
	) {
		const currentState = getEditorCollectionState(configId);
		if (!currentState) {
			return;
		}

		updateCollectionEditorState(configId, {
			...currentState,
			groupItemsById: {
				...currentState.groupItemsById,
				[groupId]: event.detail.items
			}
		});
	}

	function handleCollectionGroupFinalize(
		configId: string,
		groupId: string,
		event: CustomEvent<DndEvent<SortableItem>>
	) {
		const currentState = getEditorCollectionState(configId);
		if (!currentState) {
			return;
		}

		updateCollectionEditorState(configId, {
			...currentState,
			groupItemsById: {
				...currentState.groupItemsById,
				[groupId]: event.detail.items
			}
		});
	}

	onMount(() => {
		if (!isLocalMode) {
			return;
		}

		void localContent.refresh();
	});

	$effect(() => {
		if (isEditingNavigation || !currentPageSlug) {
			return;
		}

		const currentConfig = configs.find(
			(config: DiscoveredConfig) => config.slug === currentPageSlug
		);
		if (!currentConfig?.config.collection) {
			return;
		}

		if (expandedCollections[currentPageSlug]) {
			return;
		}

		expandedCollections = {
			...expandedCollections,
			[currentPageSlug]: true
		};
	});

	$effect(() => {
		if (!isLocalMode || $localContent.status !== 'ready') {
			return;
		}

		void loadLocalCollectionItems(configs);
	});

	$effect(() => {
		if (isLocalMode || isEditingNavigation || !currentPageSlug) {
			return;
		}

		const currentConfig = configs.find(
			(config: DiscoveredConfig) => config.slug === currentPageSlug
		);
		if (!currentConfig?.config.collection) {
			return;
		}

		void loadGitHubCollectionItems(currentConfig);
	});
</script>

<div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
	<aside class="space-y-4 lg:sticky lg:top-8 lg:self-start">
		<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="border-b border-gray-100 px-1 pb-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
							Site Structure
						</p>
						<p class="mt-1 text-sm text-gray-600">
							{configs.length} content {configs.length === 1 ? 'type' : 'types'}
						</p>
					</div>

					{#if canEditNavigation}
						{#if isEditingNavigation}
							<div class="flex gap-2">
								<button
									type="button"
									class="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
									onclick={cancelNavigationEditing}
									disabled={savingNavigation}
								>
									Cancel
								</button>
								<button
									type="button"
									class="rounded-full bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
									onclick={() => void saveNavigationEditing()}
									disabled={!hasUnsavedNavigationChanges || savingNavigation}
								>
									{savingNavigation ? 'Saving…' : 'Save'}
								</button>
							</div>
						{:else}
							<button
								type="button"
								class="inline-flex items-center rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
								onclick={() => void startNavigationEditing()}
								disabled={preparingNavigationEditor}
							>
								{preparingNavigationEditor ? 'Preparing…' : 'Edit navigation'}
							</button>
						{/if}
					{/if}
				</div>

				{#if isEditingNavigation}
					<p class="mt-2 text-sm text-gray-500">
						Drag items to reorder the sidebar. Expand collections to organise their items.
					</p>
				{/if}
			</div>

			{#if isLocalMode && $localContent.status === 'loading' && configs.length === 0}
				<p class="px-1 py-4 text-sm text-gray-500">Scanning local repository…</p>
			{:else if isLocalMode && $localContent.error}
				<p class="px-1 py-4 text-sm text-red-700">{$localContent.error}</p>
			{:else if configs.length === 0}
				<p class="px-1 py-4 text-sm text-gray-500">No content configs found yet.</p>
			{:else if isEditingNavigation && navigationDraft}
				<div
					class="mt-3 space-y-2"
					use:dragHandleZone={{
						items: topLevelEditorItems,
						type: 'top-level',
						flipDurationMs,
						delayTouchStart: true
					}}
					onconsider={handleTopLevelConsider}
					onfinalize={handleTopLevelFinalize}
				>
					{#each topLevelEditorItems as item (`${item.id}:${item.isDndShadowItem ? 'shadow' : 'real'}`)}
						{@const config = configs.find((entry) => entry.slug === item.slug)}
						{#if config}
							{@const collectionSetup = getCollectionSetup(config.slug)}
							{@const collectionDraft = getDraftCollection(config.config.id)}
							{@const collectionState = getEditorCollectionState(config.config.id)}
							{@const isExpanded = isCollectionExpanded(config.slug)}
							{@const collectionLocked =
								!!config.config.collection && !collectionSetup?.canOrderItems}
							<div
								class="rounded-xl border border-gray-200 bg-white"
								data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
							>
								<div class="flex items-center gap-2 p-2">
									<div
										use:dragHandle
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
										aria-label={`Drag ${item.label}`}
									>
										<svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
											<circle cx="6" cy="6" r="1.25" />
											<circle cx="6" cy="10" r="1.25" />
											<circle cx="6" cy="14" r="1.25" />
											<circle cx="11" cy="6" r="1.25" />
											<circle cx="11" cy="10" r="1.25" />
											<circle cx="11" cy="14" r="1.25" />
										</svg>
									</div>

									{#if item.isCollection}
										<button
											type="button"
											class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
											onclick={() => toggleCollection(config)}
											aria-expanded={isExpanded}
											aria-label={isExpanded ? 'Collapse collection' : 'Expand collection'}
										>
											<svg
												viewBox="0 0 20 20"
												fill="none"
												stroke="currentColor"
												stroke-width="1.75"
												class="h-4 w-4 transition-transform"
												class:rotate-90={isExpanded}
											>
												<path d="M7 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
											</svg>
										</button>
									{:else}
										<span class="h-8 w-8 shrink-0"></span>
									{/if}

									<div class="min-w-0 flex-1 rounded-lg px-3 py-2">
										<p class="truncate font-medium text-gray-900">{item.label}</p>
										{#if item.isCollection}
											<p class="mt-1 text-xs text-gray-500">
												{getFlatCollectionItemCount(config.slug)}
												{getFlatCollectionItemCount(config.slug) === 1 ? ' item' : ' items'}
											</p>
										{/if}
									</div>
								</div>

								{#if item.isCollection && isExpanded}
									<div class="border-t border-gray-100 px-3 pt-2 pb-3">
										{#if collectionLocked}
											<p class="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
												This collection needs an
												<code class="rounded bg-gray-200 px-1 py-0.5 text-xs">idField</code>
												before its items can be reordered.
											</p>
										{:else if !isLocalMode && getGitHubCollectionStatus(config.slug) === 'loading' && !collectionState}
											<p class="px-3 py-2 text-sm text-gray-500">Loading items…</p>
										{:else if !isLocalMode && getGitHubCollectionStatus(config.slug) === 'error' && !collectionState}
											<div class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
												<p>{getGitHubCollectionError(config.slug) ?? "Couldn't load items."}</p>
												<button
													type="button"
													class="mt-2 font-medium underline hover:text-red-800"
													onclick={() => void loadGitHubCollectionItems(config, { force: true })}
												>
													Retry
												</button>
											</div>
										{:else if collectionDraft && collectionState}
											<div class="space-y-3">
												{#each collectionDraft.groups as group (group.id)}
													<div class="rounded-xl border border-gray-200 bg-gray-50 p-2">
														<p
															class="px-2 pb-2 text-[0.7rem] font-semibold tracking-[0.16em] text-gray-500 uppercase"
														>
															{group.label}
														</p>
														<div
															class="space-y-1 rounded-lg"
															use:dragHandleZone={{
																items: collectionState.groupItemsById[group.id] ?? [],
																type: `collection:${config.config.id}`,
																flipDurationMs,
																delayTouchStart: true
															}}
															onconsider={(event) =>
																handleCollectionGroupConsider(config.config.id!, group.id, event)}
															onfinalize={(event) =>
																handleCollectionGroupFinalize(config.config.id!, group.id, event)}
														>
															{#each collectionState.groupItemsById[group.id] ?? [] as groupItem (`${groupItem.id}:${groupItem.isDndShadowItem ? 'shadow' : 'real'}`)}
																<div
																	class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2"
																	data-is-dnd-shadow-item-hint={groupItem[
																		SHADOW_ITEM_MARKER_PROPERTY_NAME
																	]}
																>
																	<div
																		use:dragHandle
																		class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
																		aria-label={`Drag ${groupItem.title}`}
																	>
																		<svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
																			<circle cx="6" cy="6" r="1.25" />
																			<circle cx="6" cy="10" r="1.25" />
																			<circle cx="6" cy="14" r="1.25" />
																			<circle cx="11" cy="6" r="1.25" />
																			<circle cx="11" cy="10" r="1.25" />
																			<circle cx="11" cy="14" r="1.25" />
																		</svg>
																	</div>
																	<div class="min-w-0 flex-1">
																		<p class="truncate text-sm font-medium text-gray-800">
																			{groupItem.title}
																		</p>
																		<p class="mt-1 text-xs text-gray-500">{groupItem.id}</p>
																	</div>
																</div>
															{/each}

															{#if (collectionState.groupItemsById[group.id] ?? []).length === 0}
																<div
																	class="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-400"
																>
																	Drop items here
																</div>
															{/if}
														</div>
													</div>
												{/each}

												<div class="rounded-xl border border-gray-200 bg-gray-50 p-2">
													<p
														class="px-2 pb-2 text-[0.7rem] font-semibold tracking-[0.16em] text-gray-500 uppercase"
													>
														Ungrouped
													</p>
													<div
														class="space-y-1 rounded-lg"
														use:dragHandleZone={{
															items: collectionState.ungroupedItems,
															type: `collection:${config.config.id}`,
															flipDurationMs,
															delayTouchStart: true
														}}
														onconsider={(event) =>
															handleCollectionUngroupedConsider(config.config.id!, event)}
														onfinalize={(event) =>
															handleCollectionUngroupedFinalize(config.config.id!, event)}
													>
														{#each collectionState.ungroupedItems as ungroupedItem (`${ungroupedItem.id}:${ungroupedItem.isDndShadowItem ? 'shadow' : 'real'}`)}
															<div
																class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2"
																data-is-dnd-shadow-item-hint={ungroupedItem[
																	SHADOW_ITEM_MARKER_PROPERTY_NAME
																]}
															>
																<div
																	use:dragHandle
																	class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
																	aria-label={`Drag ${ungroupedItem.title}`}
																>
																	<svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
																		<circle cx="6" cy="6" r="1.25" />
																		<circle cx="6" cy="10" r="1.25" />
																		<circle cx="6" cy="14" r="1.25" />
																		<circle cx="11" cy="6" r="1.25" />
																		<circle cx="11" cy="10" r="1.25" />
																		<circle cx="11" cy="14" r="1.25" />
																	</svg>
																</div>
																<div class="min-w-0 flex-1">
																	<p class="truncate text-sm font-medium text-gray-800">
																		{ungroupedItem.title}
																	</p>
																	<p class="mt-1 text-xs text-gray-500">{ungroupedItem.id}</p>
																</div>
															</div>
														{/each}

														{#if collectionState.ungroupedItems.length === 0}
															<div
																class="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-400"
															>
																Drop items here
															</div>
														{/if}
													</div>
												</div>
											</div>
										{:else}
											<p class="px-3 py-2 text-sm text-gray-500">No items yet.</p>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{:else}
				<nav class="mt-3 space-y-2">
					{#each configs as config (config.slug)}
						{@const isCollection = !!config.config.collection}
						{@const isSelected = currentPageSlug === config.slug}
						{@const isExpanded = isCollectionExpanded(config.slug)}
						<div
							class="rounded-xl border border-gray-200 bg-white transition-colors"
							class:border-blue-200={isSelected}
							class:bg-blue-50={isSelected}
						>
							<div class="flex items-center gap-2 p-2">
								{#if isCollection}
									<button
										type="button"
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
										onclick={() => toggleCollection(config)}
										aria-expanded={isExpanded}
										aria-label={isExpanded ? 'Collapse collection' : 'Expand collection'}
									>
										<svg
											viewBox="0 0 20 20"
											fill="none"
											stroke="currentColor"
											stroke-width="1.75"
											class="h-4 w-4 transition-transform"
											class:rotate-90={isExpanded}
										>
											<path d="M7 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
										</svg>
									</button>
								{:else}
									<span class="h-8 w-8 shrink-0"></span>
								{/if}

								<a
									href={resolve(`/pages/${config.slug}`)}
									class="min-w-0 flex-1 rounded-lg px-3 py-2 transition-colors hover:bg-white/80"
									class:text-blue-900={isSelected}
									class:text-gray-800={!isSelected}
								>
									<p class="truncate font-medium">{config.config.label}</p>
									{#if isCollection}
										{@const navigation = getCollectionItems(config.slug)}
										<p class="mt-1 text-xs text-gray-500">
											{#if isLocalMode || getGitHubCollectionStatus(config.slug) === 'ready'}
												{navigation.items.length +
													navigation.groups.reduce((count, group) => count + group.items.length, 0)}
												{navigation.items.length +
													navigation.groups.reduce(
														(count, group) => count + group.items.length,
														0
													) ===
												1
													? 'item'
													: 'items'}
											{:else if getGitHubCollectionStatus(config.slug) === 'loading'}
												Loading items…
											{:else if getGitHubCollectionStatus(config.slug) === 'error'}
												Couldn't load items
											{/if}
										</p>
									{/if}
								</a>

								{#if isCollection}
									<a
										href={resolve(`/pages/${config.slug}/new`)}
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
										aria-label={`New ${getConfigItemLabel(config.config)}`}
										title={`New ${getConfigItemLabel(config.config)}`}
									>
										+
									</a>
								{/if}
							</div>

							{#if isCollection && isExpanded}
								{@const navigation = getCollectionItems(config.slug)}
								{@const flatItemCount =
									navigation.items.length +
									navigation.groups.reduce((count, group) => count + group.items.length, 0)}
								<div class="px-3 pb-3">
									{#if isLocalMode && $localContent.status === 'loading' && flatItemCount === 0}
										<p class="pl-10 text-sm text-gray-500">Loading items…</p>
									{:else if !isLocalMode && ['idle', 'loading'].includes(getGitHubCollectionStatus(config.slug)) && flatItemCount === 0}
										<p class="pl-10 text-sm text-gray-500">Loading items…</p>
									{:else if !isLocalMode && getGitHubCollectionStatus(config.slug) === 'error' && flatItemCount === 0}
										<div class="pl-10 text-sm text-red-700">
											<p>{getGitHubCollectionError(config.slug) ?? "Couldn't load items."}</p>
											<button
												type="button"
												class="mt-2 text-sm font-medium text-red-700 underline hover:text-red-800"
												onclick={() => void loadGitHubCollectionItems(config, { force: true })}
											>
												Retry
											</button>
										</div>
									{:else if flatItemCount === 0}
										<p class="pl-10 text-sm text-gray-500">No items yet.</p>
									{:else}
										<div class="space-y-1 pl-10">
											{#each navigation.groups as group (group.id)}
												{#if group.items.length > 0}
													<div class="pt-2">
														<p
															class="px-3 pb-1 text-[0.7rem] font-semibold tracking-[0.16em] text-gray-500 uppercase"
														>
															{group.label}
														</p>
														<div class="space-y-1">
															{#each group.items as item (item.itemId)}
																<a
																	href={resolve(`/pages/${config.slug}/${item.itemId}`)}
																	class="block rounded-lg px-3 py-2 text-sm transition-colors"
																	class:bg-blue-100={isSelected && currentItemId === item.itemId}
																	class:text-blue-900={isSelected && currentItemId === item.itemId}
																	class:text-gray-700={!(
																		isSelected && currentItemId === item.itemId
																	)}
																	class:hover:bg-gray-100={!(
																		isSelected && currentItemId === item.itemId
																	)}
																>
																	{item.title}
																</a>
															{/each}
														</div>
													</div>
												{/if}
											{/each}
											{#each navigation.items as item (item.itemId)}
												<a
													href={resolve(`/pages/${config.slug}/${item.itemId}`)}
													class="block rounded-lg px-3 py-2 text-sm transition-colors"
													class:bg-blue-100={isSelected && currentItemId === item.itemId}
													class:text-blue-900={isSelected && currentItemId === item.itemId}
													class:text-gray-700={!(isSelected && currentItemId === item.itemId)}
													class:hover:bg-gray-100={!(isSelected && currentItemId === item.itemId)}
												>
													{item.title}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</nav>
			{/if}
		</div>

		{#if isLocalMode}
			<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
						onclick={() => void localContent.refresh({ force: true })}
					>
						Rescan repo
					</button>
					{#if $localContent.rootConfig?.local?.previewUrl}
						<button
							type="button"
							onclick={() =>
								window.open(
									$localContent.rootConfig?.local?.previewUrl,
									'_blank',
									'noopener,noreferrer'
								)}
							class="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
						>
							Open preview
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
			<p class="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">Site Settings</p>
			<p class="mt-2 text-sm text-gray-600">Enable manual navigation and fix locked sections.</p>
			<a
				href={resolve('/pages/settings')}
				class="mt-3 inline-flex rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
			>
				Open Settings
			</a>
		</div>
	</aside>

	<section class="min-w-0">
		{@render children?.()}
	</section>
</div>
