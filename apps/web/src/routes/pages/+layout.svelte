<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount, setContext, type Snippet } from 'svelte';
	import { get, writable } from 'svelte/store';
	import {
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		SHADOW_PLACEHOLDER_ITEM_ID,
		type DndEvent
	} from 'svelte-dnd-action';
	import type { LayoutData } from './$types';
	import type { DiscoveredConfig } from '$lib/config/discovery';
	import { fetchContentDocument } from '$lib/content/service';
	import CollectionPanel from '$lib/features/content-management/components/CollectionPanel.svelte';
	import Sidebar from '$lib/features/content-management/components/Sidebar.svelte';
	import Header from '$lib/features/content-management/components/Header.svelte';
	import RemountOnValue from '$lib/components/RemountOnValue.svelte';
	import SidePanelHost from '$lib/components/form/SidePanelHost.svelte';
	import {
		FORM_SIDE_PANEL,
		type FormSidePanelContext,
		type FormSidePanelState
	} from '$lib/features/forms/side-panel';
	import type { WorkspaceNavItem } from '$lib/features/content-management/components/workspace-types';
	import {
		areNavigationDraftsEqual,
		cloneNavigationDraft,
		createNavigationDraft,
		serializeNavigationDraft,
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
		saveCollectionOrder,
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

	// Canonical layout terms:
	// - Sidebar: left app/site navigation
	// - Header: top action bar for the current view
	// - Collection Panel: panel for top-level collection item management
	// - Main Panel: primary content/view/edit surface
	// - Side Panel: flexible right-side panel for secondary editing flows
	const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';
	const activeSidePanel = writable<FormSidePanelState | null>(null);

	setContext<FormSidePanelContext>(FORM_SIDE_PANEL, {
		activePanel: activeSidePanel,
		setActivePanel(panel) {
			activeSidePanel.set(panel);
		}
	});

	let localCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionLoadStatusBySlug = $state<Record<string, CollectionLoadStatus>>({});
	let githubCollectionErrorBySlug = $state<Record<string, string | null>>({});
	let collectionLoadRequest = 0;
	let isEditingNavigation = $state(false);
	let preparingNavigationEditor = $state(false);
	let savingNavigation = $state(false);
	let savingCollectionOrder = $state(false);
	let isCollectionPanelCollapsed = $state(false);
	let isMobileSidebarOpen = $state(false);
	let isMobileCollectionOpen = $state(false);
	let isDesktopViewport = $state(false);
	let localRescanVersion = $state(0);
	let navigationDraft = $state<NavigationDraft | null>(null);
	let initialNavigationDraft = $state<NavigationDraft | null>(null);
	let topLevelEditorItems = $state<WorkspaceNavItem[]>([]);

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const manifestState = $derived(
		isLocalMode ? $localContent.navigationManifest : data.navigationManifest
	);
	const availableConfigs = $derived(isLocalMode ? $localContent.configs : data.configs);
	const navigationManifest = $derived(manifestState.manifest);
	const rootConfig = $derived(isLocalMode ? $localContent.rootConfig : data.rootConfig);
	const configs = $derived(
		orderDiscoveredConfigs(availableConfigs, navigationManifest, rootConfig)
	);
	const setup = $derived(
		getManualNavigationSetupState(availableConfigs, manifestState, rootConfig)
	);
	const collectionItemsBySlug = $derived(
		isLocalMode ? localCollectionItemsBySlug : githubCollectionItemsBySlug
	);
	const currentPageSlug = $derived(page.params.page ?? null);
	const currentItemId = $derived(page.params.itemId ?? null);
	const currentConfig = $derived(
		configs.find((config: DiscoveredConfig) => config.slug === currentPageSlug) ?? null
	);
	const isPreviewChangesRoute = $derived(page.url.pathname.includes('/preview-changes'));
	const shouldShowCollectionPanel = $derived(
		!!currentConfig?.config.collection && !isEditingNavigation && !isPreviewChangesRoute
	);
	const showCollectionPanel = $derived(
		shouldShowCollectionPanel && !!currentConfig && !isCollectionPanelCollapsed
	);
	const workspaceGridClass = $derived.by(() => {
		if (showCollectionPanel && $activeSidePanel) {
			return 'grid min-h-0 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)_minmax(0,3fr)]';
		}

		if (showCollectionPanel) {
			return 'grid min-h-0 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]';
		}

		if ($activeSidePanel) {
			return 'grid min-h-0 overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]';
		}

		return 'grid min-h-0 overflow-hidden';
	});
	const canEditNavigation = $derived(setup.status === 'active' && manifestState.manifest !== null);
	const canAddPage = $derived(
		isLocalMode
			? $localContent.instructionDiscovery.instructions.length > 0
			: (data.instructionDiscovery?.instructions.length ?? 0) > 0
	);
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

		if (page.url.pathname === '/pages/new' || page.url.pathname === '/pages/instructions') {
			return 'Add Page';
		}

		if (page.url.pathname.endsWith('/settings')) {
			return 'Settings';
		}

		return currentConfig?.config.label ?? siteName;
	});

	onMount(() => {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');

		const updateViewport = (event?: MediaQueryList | MediaQueryListEvent) => {
			isDesktopViewport = event ? event.matches : mediaQuery.matches;
		};

		updateViewport(mediaQuery);
		mediaQuery.addEventListener('change', updateViewport);

		return () => mediaQuery.removeEventListener('change', updateViewport);
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
		return configs.find((config) => config.config._tentmanId === configId) ?? null;
	}

	function buildTopLevelEditorItems(draft: NavigationDraft): WorkspaceNavItem[] {
		const orderedItems = draft.contentOrder.flatMap((configId) => {
			const config = getConfigById(configId);
			if (!config || !config.config._tentmanId) {
				return [];
			}

			return [
				{
					id: config.config._tentmanId,
					slug: config.slug,
					label: config.config.label,
					isCollection: !!config.config.collection
				}
			];
		});

		const seenIds = new Set(orderedItems.map((item) => item.id));

		for (const config of configs) {
			if (!config.config._tentmanId || seenIds.has(config.config._tentmanId)) {
				continue;
			}

			orderedItems.push({
				id: config.config._tentmanId,
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
			localContent.reset();
			await localRepo.clear({ invalidate: false });
		}

		await goto(resolve('/repos'));
	}

	async function handleRescanLocalRepo() {
		if (!isLocalMode) {
			return;
		}

		try {
			await localContent.refresh({ force: true });
			const state = get(localContent);

			if (state.status === 'error') {
				toasts.error(state.error ?? 'Failed to rescan repo.');
				return;
			}

			const configCount = state.configs.length;
			const blockCount = state.blockConfigs.length;
			toasts.success(
				`Found ${configCount} content ${configCount === 1 ? 'config' : 'configs'} and ${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}.`
			);
			localRescanVersion += 1;
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to rescan repo.');
		}
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
			const draft = createNavigationDraft(
				configs,
				navigationManifest,
				collectionItemsBySlug,
				rootConfig
			);
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
						manifest,
						branchName: get(draftBranch).branchName
					})
				});

				if (response.status === 401) {
					await redirectToReposForExpiredSession();
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to save navigation manifest');
				}

				const result = (await response.json()) as {
					branchName?: string | null;
				};
				if (result.branchName && data.selectedRepo) {
					draftBranch.setBranch(result.branchName, data.selectedRepo.full_name);
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
		if (!config.config._tentmanId || savingCollectionOrder) {
			return;
		}

		savingCollectionOrder = true;

		try {
			if (isLocalMode) {
				const repoState = get(localRepo);
				if (!repoState.backend) {
					throw new Error('No local repository is open.');
				}

				await saveCollectionOrder(repoState.backend, config, collection, navigationManifest, {
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
						action: 'save-collection-order',
						collection: config.slug,
						order: collection,
						branchName: get(draftBranch).branchName
					})
				});

				if (response.status === 401) {
					await redirectToReposForExpiredSession();
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to save collection order');
				}

				const result = (await response.json()) as {
					branchName?: string | null;
				};
				if (result.branchName && data.selectedRepo) {
					draftBranch.setBranch(result.branchName, data.selectedRepo.full_name);
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

	$effect(() => {
		page.url.pathname;
		page.url.search;
		isMobileSidebarOpen = false;
		isMobileCollectionOpen = false;
	});

	$effect(() => {
		if (!$activeSidePanel) {
			return;
		}

		isMobileSidebarOpen = false;
		isMobileCollectionOpen = false;
	});
</script>

<div
	class="grid h-dvh overflow-hidden bg-white text-stone-950 lg:grid-cols-[15.5rem_minmax(0,1fr)]"
	data-sveltekit-preload-data="hover"
>
	<div class="hidden lg:block">
		<Sidebar
			{siteName}
			{repoLabel}
			{configs}
			{currentPageSlug}
			isAuthenticated={data.isAuthenticated}
			{isLocalMode}
			{canEditNavigation}
			{canAddPage}
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
	</div>

	{#if isMobileSidebarOpen}
		<div
			class="fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-[1px] lg:hidden"
			data-testid="pages-mobile-sidebar"
		>
			<button
				type="button"
				class="absolute inset-0"
				aria-label="Dismiss site navigation overlay"
				onclick={() => (isMobileSidebarOpen = false)}
			></button>
			<div class="relative h-full w-[min(20rem,calc(100vw-2.5rem))]">
				<Sidebar
					{siteName}
					{repoLabel}
					{configs}
					{currentPageSlug}
					isAuthenticated={data.isAuthenticated}
					{isLocalMode}
					{canEditNavigation}
					{canAddPage}
					{isEditingNavigation}
					{preparingNavigationEditor}
					{savingNavigation}
					{hasUnsavedNavigationChanges}
					{topLevelEditorItems}
					mobile={true}
					onclose={() => (isMobileSidebarOpen = false)}
					onstartnavigationedit={() => void startNavigationEditing()}
					oncancelnavigationedit={cancelNavigationEditing}
					onsavenavigationedit={() => void saveNavigationEditing()}
					onnavconsider={handleTopLevelConsider}
					onnavfinalize={handleTopLevelFinalize}
					onswitchsite={() => void handleSwitchSite()}
					onrescan={() => void handleRescanLocalRepo()}
				/>
			</div>
		</div>
	{/if}

	<main class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
		<Header
			title={workspaceTitle}
			{previewUrl}
			showPublish={data.isAuthenticated && !!$draftBranch.branchName}
			publishHref={resolve('/publish')}
			showSidebarToggle={true}
			sidebarOpen={isMobileSidebarOpen}
			onToggleSidebar={() => (isMobileSidebarOpen = !isMobileSidebarOpen)}
			showCollectionToggle={shouldShowCollectionPanel}
			collectionCollapsed={isCollectionPanelCollapsed}
			onToggleCollection={() => (isCollectionPanelCollapsed = !isCollectionPanelCollapsed)}
			collectionOpen={isMobileCollectionOpen}
			onOpenCollection={() => (isMobileCollectionOpen = !isMobileCollectionOpen)}
		/>

		<div class={workspaceGridClass} data-testid="pages-workspace-grid">
			{#if showCollectionPanel && currentConfig}
				{@const navigation = getCollectionItems(currentConfig.slug)}
				{@const collectionSetup = getCollectionSetup(currentConfig.slug)}
				<div class="hidden min-h-0 min-w-0 lg:grid">
					<CollectionPanel
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
				</div>
			{/if}

			<section
				class="min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
				data-testid="pages-main-panel"
			>
				<div class="mx-auto w-full max-w-[var(--workspace-content-max-width)]">
					<RemountOnValue
						value={isLocalMode
							? `${page.url.pathname}${page.url.search}:${localRescanVersion}`
							: `${page.url.pathname}${page.url.search}`}
					>
						{@render children?.()}
					</RemountOnValue>
				</div>
			</section>

			{#if $activeSidePanel && isDesktopViewport}
				<section
					class="hidden min-h-0 min-w-0 overflow-hidden border-l border-stone-200 bg-white lg:block"
					data-testid="pages-side-panel"
				>
					<SidePanelHost panel={$activeSidePanel} framed={false} />
				</section>
			{/if}
		</div>
	</main>
</div>

{#if shouldShowCollectionPanel && currentConfig && isMobileCollectionOpen}
	{@const navigation = getCollectionItems(currentConfig.slug)}
	{@const collectionSetup = getCollectionSetup(currentConfig.slug)}
	<div
		class="fixed inset-0 z-30 grid grid-rows-[auto_minmax(0,1fr)] bg-white lg:hidden"
		data-testid="pages-mobile-collection-panel"
	>
		<div class="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
			<div class="min-w-0">
				<p class="text-[0.7rem] font-semibold tracking-[0.16em] text-stone-500 uppercase">
					Collection
				</p>
				<h2 class="truncate text-base font-semibold text-stone-950">
					{currentConfig.config.label}
				</h2>
			</div>
			<button
				type="button"
				class="tm-btn tm-btn-secondary"
				onclick={() => (isMobileCollectionOpen = false)}
			>
				Done
			</button>
		</div>
		<div class="min-h-0">
			<CollectionPanel
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
		</div>
	</div>
{/if}

{#if $activeSidePanel && !isDesktopViewport}
	<div class="fixed inset-0 z-30 bg-white lg:hidden" data-testid="pages-mobile-side-panel">
		<SidePanelHost panel={$activeSidePanel} framed={false} />
	</div>
{/if}
