<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { get } from 'svelte/store';
	import {
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		SHADOW_PLACEHOLDER_ITEM_ID,
		type DndEvent
	} from 'svelte-dnd-action';
	import type { LayoutData } from './$types';
	import type { DiscoveredConfig } from '$lib/config/discovery';
	import { fetchContentDocument } from '$lib/content/service';
	import CollectionIndex from '$lib/features/content-management/components/CollectionIndex.svelte';
	import PagesSidebar from '$lib/features/content-management/components/PagesSidebar.svelte';
	import PagesTopbar from '$lib/features/content-management/components/PagesTopbar.svelte';
	import type { WorkspaceNavItem } from '$lib/features/content-management/components/workspace-types';
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
	import { draftBranch } from '$lib/stores/draft-branch';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { traceRouting } from '$lib/utils/routing-trace';
	import { toasts } from '$lib/stores/toasts';
	import { buildReposRedirect } from '$lib/utils/routing';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	type CollectionItemsBySlug = Record<string, OrderedCollectionNavigation>;
	type CollectionLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

	const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

	let localCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionLoadStatusBySlug = $state<Record<string, CollectionLoadStatus>>({});
	let githubCollectionErrorBySlug = $state<Record<string, string | null>>({});
	let collectionLoadRequest = 0;
	let isEditingNavigation = $state(false);
	let preparingNavigationEditor = $state(false);
	let savingNavigation = $state(false);
	let savingCollectionOrder = $state(false);
	let navigationDraft = $state<NavigationDraft | null>(null);
	let initialNavigationDraft = $state<NavigationDraft | null>(null);
	let topLevelEditorItems = $state<WorkspaceNavItem[]>([]);

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
	const currentConfig = $derived(
		configs.find((config: DiscoveredConfig) => config.slug === currentPageSlug) ?? null
	);
	const isPreviewChangesRoute = $derived(page.url.pathname.includes('/preview-changes'));
	const shouldShowCollectionIndex = $derived(
		!!currentConfig?.config.collection && !isEditingNavigation && !isPreviewChangesRoute
	);
	const canEditNavigation = $derived(setup.status === 'active' && manifestState.manifest !== null);
	const hasUnsavedNavigationChanges = $derived(
		isEditingNavigation &&
			navigationDraft !== null &&
			initialNavigationDraft !== null &&
			!areNavigationDraftsEqual(navigationDraft, initialNavigationDraft)
	);
	const siteName = $derived.by(() => {
		if (isLocalMode) {
			return $localContent.rootConfig?.siteName ?? data.selectedBackend?.repo.name ?? 'Tentman';
		}

		return data.rootConfig?.siteName ?? data.selectedRepo?.name ?? 'Tentman';
	});
	const repoLabel = $derived.by(() => {
		if (data.selectedBackend?.kind === 'github' && data.selectedRepo) {
			return data.selectedRepo.full_name;
		}

		if (isLocalMode) {
			return data.selectedBackend?.repo.pathLabel ?? data.selectedBackend?.repo.name ?? null;
		}

		return null;
	});
	const previewUrl = $derived(
		isLocalMode ? ($localContent.rootConfig?.local?.previewUrl ?? null) : null
	);
	const workspaceTitle = $derived.by(() => {
		if (page.url.pathname === '/pages' || page.url.pathname === '/pages/') {
			return 'Overview';
		}

		if (page.url.pathname.endsWith('/settings')) {
			return 'Settings';
		}

		return currentConfig?.config.label ?? siteName;
	});

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

	function getCollectionLoadStatus(slug: string): CollectionLoadStatus {
		if (isLocalMode) {
			return $localContent.status === 'loading' ? 'loading' : 'ready';
		}

		return getGitHubCollectionStatus(slug);
	}

	function getCollectionLoadError(slug: string): string | null {
		if (isLocalMode) {
			return $localContent.error;
		}

		return getGitHubCollectionError(slug);
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

	function buildTopLevelEditorItems(draft: NavigationDraft): WorkspaceNavItem[] {
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

	function syncTopLevelDraft(items: WorkspaceNavItem[]) {
		if (!navigationDraft) {
			return;
		}

		navigationDraft = setNavigationDraftContentOrder(
			navigationDraft,
			sanitizeSortableItems(items).map((item) => item.id)
		);
	}

	async function redirectToReposForExpiredSession() {
		const redirectTarget = buildReposRedirect(resolve('/repos'), window.location);
		traceRouting('navigation:assign', {
			to: redirectTarget,
			source: 'pages-layout.expired-session'
		});
		window.location.assign(redirectTarget);
	}

	async function handleSwitchSite() {
		if (isLocalMode) {
			await localRepo.clear();
		}

		await goto(resolve('/repos'));
	}

	async function handleRescanLocalRepo() {
		if (!isLocalMode) {
			return;
		}

		await localContent.refresh({ force: true });
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
				await redirectToReposForExpiredSession();
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

	async function loadLocalCollectionItems(nextConfigs: DiscoveredConfig[]) {
		const repoState = get(localRepo);
		if (!repoState.backend) {
			localCollectionItemsBySlug = {};
			return;
		}

		const requestId = ++collectionLoadRequest;
		const collectionEntries = await Promise.all(
			nextConfigs
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
						console.error(`Failed to load local collection items for ${config.slug}:`, error);
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

	async function startNavigationEditing() {
		if (!canEditNavigation || preparingNavigationEditor || savingNavigation) {
			return;
		}

		preparingNavigationEditor = true;

		try {
			const draft = createNavigationDraft(configs, navigationManifest, collectionItemsBySlug);
			navigationDraft = draft;
			initialNavigationDraft = cloneNavigationDraft(draft);
			topLevelEditorItems = buildTopLevelEditorItems(draft);
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
				await loadLocalCollectionItems(configs);
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
					await redirectToReposForExpiredSession();
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to save navigation manifest');
				}
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

	async function saveCollectionCustomOrder(
		config: DiscoveredConfig,
		collection: NavigationDraftCollection
	) {
		if (!config.config.id || savingCollectionOrder) {
			return;
		}

		savingCollectionOrder = true;

		try {
			const draft = createNavigationDraft(configs, navigationManifest, collectionItemsBySlug);
			const manifest = serializeNavigationDraft(
				setNavigationDraftCollection(draft, config.config.id, collection)
			);

			if (isLocalMode) {
				const repoState = get(localRepo);
				if (!repoState.backend) {
					throw new Error('No local repository is open.');
				}

				await writeNavigationManifest(repoState.backend, manifest, {
					message: MANIFEST_COMMIT_MESSAGE
				});
				await localContent.refresh({ force: true });
				await loadLocalCollectionItems(configs);
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
					await redirectToReposForExpiredSession();
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to save collection order');
				}

				await loadGitHubCollectionItems(config, { force: true });
			}

			await invalidateAll();
			toasts.success(`${config.config.label} order saved.`);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to save collection order.');
		} finally {
			savingCollectionOrder = false;
		}
	}

	function handleTopLevelConsider(event: CustomEvent<DndEvent<WorkspaceNavItem>>) {
		topLevelEditorItems = event.detail.items;
		syncTopLevelDraft(event.detail.items);
	}

	function handleTopLevelFinalize(event: CustomEvent<DndEvent<WorkspaceNavItem>>) {
		topLevelEditorItems = event.detail.items;
		syncTopLevelDraft(event.detail.items);
	}

	onMount(() => {
		if (!isLocalMode) {
			return;
		}

		void localContent.refresh();
	});

	$effect(() => {
		if (!isLocalMode || $localContent.status !== 'ready') {
			return;
		}

		void loadLocalCollectionItems(configs);
	});

	$effect(() => {
		if (isLocalMode || isEditingNavigation) {
			return;
		}

		void Promise.all(
			configs
				.filter((config: DiscoveredConfig) => config.config.collection)
				.map((config: DiscoveredConfig) => loadGitHubCollectionItems(config))
		);
	});
</script>

<div
	class="grid h-screen overflow-hidden bg-white text-stone-950 lg:grid-cols-[15.5rem_minmax(0,1fr)]"
	data-sveltekit-preload-data="hover"
>
	<PagesSidebar
		{siteName}
		{repoLabel}
		{configs}
		{currentPageSlug}
		isAuthenticated={data.isAuthenticated}
		{isLocalMode}
		{canEditNavigation}
		{isEditingNavigation}
		{preparingNavigationEditor}
		{savingNavigation}
		{hasUnsavedNavigationChanges}
		{topLevelEditorItems}
		onstartnavigationedit={() => void startNavigationEditing()}
		oncancelnavigationedit={cancelNavigationEditing}
		onsavenavigationedit={() => void saveNavigationEditing()}
		onnavconsider={handleTopLevelConsider}
		onnavfinalize={handleTopLevelFinalize}
		onswitchsite={() => void handleSwitchSite()}
		onrescan={() => void handleRescanLocalRepo()}
	/>

	<main class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
		<PagesTopbar
			title={workspaceTitle}
			{previewUrl}
			showPublish={data.isAuthenticated && !!$draftBranch.branchName}
			publishHref={resolve('/publish')}
		/>

		{#if shouldShowCollectionIndex && currentConfig}
			{@const navigation = getCollectionItems(currentConfig.slug)}
			{@const collectionSetup = getCollectionSetup(currentConfig.slug)}
			<div class="grid min-h-0 overflow-hidden lg:grid-cols-[auto_minmax(0,1fr)]">
				<CollectionIndex
					slug={currentConfig.slug}
					label={currentConfig.config.label}
					itemLabel={getConfigItemLabel(currentConfig.config)}
					items={navigation.items}
					groups={navigation.groups}
					{currentItemId}
					branch={page.url.searchParams.get('branch')}
					status={getCollectionLoadStatus(currentConfig.slug)}
					error={getCollectionLoadError(currentConfig.slug)}
					canOrderItems={!!collectionSetup?.canOrderItems}
					savingCustomOrder={savingCollectionOrder}
					onretry={() => void loadGitHubCollectionItems(currentConfig, { force: true })}
					onsavecustomorder={(collection: NavigationDraftCollection) =>
						void saveCollectionCustomOrder(currentConfig, collection)}
				/>
				<section class="min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
					<div class="mx-auto w-full max-w-[var(--workspace-content-max-width)]">
						{@render children?.()}
					</div>
				</section>
			</div>
		{:else}
			<section class="min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
				<div class="mx-auto w-full max-w-[var(--workspace-content-max-width)]">
					{@render children?.()}
				</div>
			</section>
		{/if}
	</main>
</div>
