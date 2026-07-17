<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { onMount, setContext, type Snippet } from 'svelte';
	import { writable } from 'svelte/store';
	import {
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		SHADOW_PLACEHOLDER_ITEM_ID,
		type DndEvent
	} from 'svelte-dnd-action';
	import type { LayoutData } from './$types';
	import type { DiscoveredConfig } from '$lib/config/discovery';
	import CollectionPanel from '$lib/features/content-management/components/CollectionPanel.svelte';
	import Sidebar from '$lib/features/content-management/components/Sidebar.svelte';
	import Header from '$lib/features/content-management/components/Header.svelte';
	import SidePanelHost from '$lib/components/form/SidePanelHost.svelte';
	import { getNetlifyPreviewUrl } from '$lib/netlify/preview';
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
		orderCollectionNavigationItems,
		orderDiscoveredConfigs,
		type OrderedCollectionNavigation
	} from '$lib/features/content-management/navigation';
	import {
		resolveContentDocumentState,
		type ResolvedContentState
	} from '$lib/features/content-management/state';
	import {
		getManualNavigationSetupState,
	} from '$lib/features/content-management/navigation-manifest';
	import { resolveCollectionSortCapabilities } from '$lib/features/content-management/collection-sorts';
	import { isCollectionSearchEnabled } from '$lib/features/content-management/config';
	import { draftBranch } from '$lib/stores/draft-branch';
	import { githubCacheWarmStatus } from '$lib/stores/github-repository-cache';
	import { localContent } from '$lib/stores/local-content';
	import { buildContentTitleContext, formatAppTitle } from '$lib/utils/page-title';
	import { traceRouting } from '$lib/utils/routing-trace';
	import { toasts } from '$lib/stores/toasts';
	import { buildReposRedirect } from '$lib/utils/routing';
	import {
		createPagesWorkspaceAdapter,
		shouldInvalidatePagesWorkspaceData
	} from '$lib/features/content-management/pages-workspace-adapters';
	import {
		createPagesWorkspaceConsumer,
		resolvePagesWorkspaceSurface,
		type PagesWorkspaceAdapterResult
	} from '$lib/features/content-management/pages-workspace-consumer';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	type CollectionItemsBySlug = Record<string, OrderedCollectionNavigation>;
	type ConfigStatesBySlug = Record<string, ResolvedContentState | null>;
	type CollectionLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

	// Canonical layout terms:
	// - Sidebar: left app/site navigation
	// - Header: top action bar for the current view
	// - Collection Panel: panel for top-level collection item management
	// - Main Panel: primary content/view/edit surface
	// - Side Panel: flexible right-side panel for secondary editing flows
	const activeSidePanel = writable<FormSidePanelState | null>(null);

	setContext<FormSidePanelContext>(FORM_SIDE_PANEL, {
		activePanel: activeSidePanel,
		setActivePanel(panel) {
			activeSidePanel.set(panel);
		}
	});

	let localCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let githubCollectionItemsBySlug = $state<CollectionItemsBySlug>({});
	let localConfigStatesBySlug = $state<ConfigStatesBySlug>({});
	let githubConfigStatesBySlug = $state<ConfigStatesBySlug>({});
	let githubConfigStatesLoaded = $state(false);
	let githubConfigStatesLoading = $state(false);
	let githubCollectionLoadStatusBySlug = $state<Record<string, CollectionLoadStatus>>({});
	let githubCollectionErrorBySlug = $state<Record<string, string | null>>({});
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

	const workspaceSurface = $derived(
		resolvePagesWorkspaceSurface({
			selectedBackend: data.selectedBackend ?? null,
			layoutData: data,
			localContent: $localContent
		})
	);
	const isLocalMode = $derived(workspaceSurface.isLocalMode);
	const manifestState = $derived(workspaceSurface.navigationManifest);
	const availableConfigs = $derived(workspaceSurface.configs);
	const navigationManifest = $derived(manifestState.manifest);
	const rootConfig = $derived(workspaceSurface.rootConfig);
	const configs = $derived(
		orderDiscoveredConfigs(availableConfigs, navigationManifest, rootConfig)
	);
	const setup = $derived(
		getManualNavigationSetupState(availableConfigs, manifestState, rootConfig)
	);
	const collectionItemsBySlug = $derived(
		isLocalMode ? localCollectionItemsBySlug : githubCollectionItemsBySlug
	);
	const configStatesBySlug = $derived(
		isLocalMode ? localConfigStatesBySlug : githubConfigStatesBySlug
	);
	const currentPageSlug = $derived(page.params.page ?? null);
	const currentItemId = $derived(page.params.itemId ?? null);
	const isEditorRoute = $derived(/\/(?:new|edit)$/.test(page.url.pathname));
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
	const canAddPage = $derived(workspaceSurface.canAddPage);
	const hasUnsavedNavigationChanges = $derived(
		isEditingNavigation &&
			navigationDraft !== null &&
			initialNavigationDraft !== null &&
			!areNavigationDraftsEqual(navigationDraft, initialNavigationDraft)
	);
	const siteName = $derived.by(() => {
		return rootConfig?.siteName ?? data.selectedBackend?.repo.name ?? data.selectedRepo?.name ?? 'Tentman';
	});
	const repoLabel = $derived(workspaceSurface.repoLabel);
	const previewUrl = $derived.by(() => {
		if (isLocalMode) {
			return rootConfig?.local?.previewUrl ?? null;
		}

		const netlifySiteName = rootConfig?.netlify?.siteName;
		const branchName = $draftBranch.branchName;
		return netlifySiteName && branchName ? getNetlifyPreviewUrl(branchName, netlifySiteName) : null;
	});
	const publishHref = $derived(resolve('/publish'));
	const openingPublishReview = $derived(navigating.to?.url.pathname === publishHref);
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
	const documentTitle = $derived.by(() => {
		const path = page.url.pathname;

		if (path === '/pages' || path === '/pages/') {
			return formatAppTitle('Overview', siteName);
		}

		if (path === '/pages/new' || path === '/pages/instructions') {
			return formatAppTitle('Add Page', siteName);
		}

		if (path.endsWith('/settings')) {
			return formatAppTitle('Settings', siteName);
		}

		if (!currentConfig) {
			return formatAppTitle(workspaceTitle, siteName);
		}

		if (currentItemId) {
			if (path.endsWith('/preview-changes')) {
				return formatAppTitle(
					buildContentTitleContext({
						kind: 'preview-item',
						config: currentConfig.config
					}),
					siteName
				);
			}

			if (path.endsWith('/edit')) {
				return formatAppTitle(
					buildContentTitleContext({
						kind: 'edit-item',
						config: currentConfig.config
					}),
					siteName
				);
			}

			return formatAppTitle(
				buildContentTitleContext({
					kind: 'view-item',
					config: currentConfig.config
				}),
				siteName
			);
		}

		if (path.endsWith('/preview-changes')) {
			return formatAppTitle(
				buildContentTitleContext({
					kind: 'preview-page',
					config: currentConfig.config
				}),
				siteName
			);
		}

		if (path.endsWith('/edit')) {
			return formatAppTitle(
				buildContentTitleContext({
					kind: 'edit-page',
					config: currentConfig.config
				}),
				siteName
			);
		}

		if (path.endsWith('/new')) {
			return formatAppTitle(
				buildContentTitleContext({
					kind: 'new-item',
					config: currentConfig.config
				}),
				siteName
			);
		}

		return formatAppTitle(
			buildContentTitleContext({
				kind: 'view-page',
				config: currentConfig.config
			}),
			siteName
		);
	});
	const localWorkspaceSurfaceKey = $derived(
		isLocalMode ? `local-rescan:${localRescanVersion}` : 'shared-workspace'
	);
	const mainPanelKey = $derived.by(() => {
		const routeKey = `${page.url.pathname}${page.url.search}`;
		return isLocalMode ? `${routeKey}:local-rescan:${localRescanVersion}` : routeKey;
	});
	const currentConfigState = $derived.by(() => {
		if (!currentConfig?.config.state || !currentPageSlug) {
			return null;
		}

		const currentPageContent = page.data.content;
		const liveState = resolveContentDocumentState(
			currentConfig.config,
			currentPageContent ?? null,
			rootConfig
		);

		if (liveState) {
			return liveState;
		}

		return configStatesBySlug[currentPageSlug] ?? null;
	});
	const currentConfigIssues = $derived(currentConfig?.issues ?? []);

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
		const navigation = collectionItemsBySlug[slug] ?? {
			items: [],
			groups: []
		};
		const config = configs.find((entry: DiscoveredConfig) => entry.slug === slug);

		if (!config?.config.collection) {
			return navigation;
		}

		return orderCollectionNavigationItems(
			config.config,
			[
				...navigation.items,
				...navigation.groups.flatMap((group) => group.items)
			],
			navigationManifest
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

	function getWorkspaceConsumer() {
		const adapter = createPagesWorkspaceAdapter({
			mode: workspaceSurface.mode,
			fetcher: fetch,
			selectedRepo: data.selectedRepo ?? null,
			repositoryIdentity: data.repositoryIdentity ?? null,
			activeDraftBranch: data.activeDraftBranch ?? null,
			bootstrap: data,
			getConfigs: () => configs,
			getNavigationManifest: () => navigationManifest,
			getRootConfig: () => rootConfig,
			getCurrentConfig: () => currentConfig,
			getRoutePath: () => page.url.pathname,
			redirectToExpiredSession: redirectToReposForExpiredSession,
			switchToRepos: () => goto('/repos'),
			resolveEndpoint: (path: string) =>
				resolve(path as '/api/repo/config-states' | '/api/repo/navigation-manifest')
		});
		return createPagesWorkspaceConsumer(adapter);
	}

	async function invalidatePagesWorkspaceData() {
		await Promise.all([
			invalidate('app:content'),
			invalidate(shouldInvalidatePagesWorkspaceData)
		]);
	}

	function getNavigationHydrationCounts(navigation: OrderedCollectionNavigation | null | undefined) {
		const items = [
			...(navigation?.items ?? []),
			...(navigation?.groups ?? []).flatMap((group) => group.items)
		];
		return {
			fallback: items.filter((item) => item.hydration === 'fallback').length,
			hydrated: items.filter((item) => item.hydration === 'hydrated').length
		};
	}

	function commitCollectionNavigationResult(
		result: Extract<PagesWorkspaceAdapterResult, { type: 'collection-navigation-loaded' }>
	) {
		if (isLocalMode) {
			localCollectionItemsBySlug = {
				...localCollectionItemsBySlug,
				[result.slug]: result.navigation
			};
			return;
		}

		githubCollectionItemsBySlug = {
			...githubCollectionItemsBySlug,
			[result.slug]: result.navigation
		};
		githubCollectionLoadStatusBySlug = {
			...githubCollectionLoadStatusBySlug,
			[result.slug]: 'ready'
		};
		githubCollectionErrorBySlug = {
			...githubCollectionErrorBySlug,
			[result.slug]: null
		};
	}

	function applyCollectionNavigationResult(result: PagesWorkspaceAdapterResult) {
		if (result.type !== 'collection-navigation-loaded') {
			return;
		}

		if (!isLocalMode) {
			const previousCounts = getNavigationHydrationCounts(githubCollectionItemsBySlug[result.slug]);
			const nextCounts = getNavigationHydrationCounts(result.navigation);
			if (
				previousCounts.fallback > 0 &&
				nextCounts.fallback === 0 &&
				nextCounts.hydrated > previousCounts.hydrated
			) {
				const previousNavigation = githubCollectionItemsBySlug[result.slug];
				globalThis.setTimeout(() => {
					if (githubCollectionItemsBySlug[result.slug] !== previousNavigation) {
						return;
					}
					commitCollectionNavigationResult(result);
				}, 250);
				return;
			}
		}

		commitCollectionNavigationResult(result);
	}

	async function applyWorkspaceResult(result: PagesWorkspaceAdapterResult) {
		if (result.type === 'session-expired') {
			return;
		}

		if (result.type === 'workspace-refreshed') {
			if (result.message) {
				toasts.success(result.message);
			}
			if (result.remountWorkspace) {
				localRescanVersion += 1;
			}
			return;
		}

		if (result.type === 'workspace-cache-cleared') {
			if (result.resetCollections) {
				githubCollectionItemsBySlug = {};
				githubCollectionLoadStatusBySlug = {};
				githubCollectionErrorBySlug = {};
			}
			if (result.resetConfigStates) {
				githubConfigStatesLoaded = false;
				githubConfigStatesLoading = false;
			}
			if (currentConfig?.config.collection) {
				await loadWorkspaceCollectionItems(currentConfig, { force: true });
			}
			if (result.message) {
				toasts.success(result.message);
			}
			return;
		}

		if (result.type === 'config-states-loaded') {
			if (isLocalMode) {
				localConfigStatesBySlug = result.statesBySlug;
			} else {
				githubConfigStatesBySlug = result.statesBySlug;
				githubConfigStatesLoaded = true;
			}
			return;
		}

		if (result.type === 'navigation-saved') {
			if (result.localCollections) {
				localCollectionItemsBySlug = result.localCollections;
			}
			if (result.localConfigStates) {
				localConfigStatesBySlug = result.localConfigStates;
			}
			cancelNavigationEditing();
			if (result.invalidateWorkspace) {
				await invalidatePagesWorkspaceData();
			}
			toasts.success(result.message);
			return;
		}

		if (result.type === 'collection-order-saved') {
			if (result.localCollections) {
				localCollectionItemsBySlug = result.localCollections;
			}
			if (result.localConfigStates) {
				localConfigStatesBySlug = result.localConfigStates;
			}
			if (result.navigation && !isLocalMode) {
				githubCollectionItemsBySlug = {
					...githubCollectionItemsBySlug,
					[result.slug]: result.navigation
				};
				githubCollectionLoadStatusBySlug = {
					...githubCollectionLoadStatusBySlug,
					[result.slug]: 'ready'
				};
			}
			if (result.invalidateWorkspace) {
				await invalidatePagesWorkspaceData();
			}
			toasts.success(result.message);
			return;
		}

		applyCollectionNavigationResult(result);
	}

	async function runWorkspaceIntent(intent: Parameters<ReturnType<typeof getWorkspaceConsumer>['run']>[0]) {
		const result = await getWorkspaceConsumer().run(intent);
		await applyWorkspaceResult(result);
		return result;
	}

	async function handleSwitchSite() {
		try {
			await runWorkspaceIntent({ type: 'switch-workspace' });
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to switch site.');
		}
	}

	async function handleRescanLocalRepo() {
		try {
			await runWorkspaceIntent({ type: 'refresh-workspace' });
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to rescan repo.');
		}
	}

	async function handleClearGitHubCache() {
		try {
			await runWorkspaceIntent({ type: 'clear-workspace-cache' });
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to clear GitHub cache.');
		}
	}

	function handleSidebarConfigSelect(config: DiscoveredConfig) {
		if (!config.config.collection) {
			return;
		}

		isCollectionPanelCollapsed = false;
	}

	function handlePromoteConfig(config: DiscoveredConfig) {
		void runWorkspaceIntent({ type: 'promote-route', slug: config.slug });
	}

	function handlePromoteCollectionItem(slug: string, itemId: string) {
		void runWorkspaceIntent({ type: 'promote-collection-item', slug, itemId });
	}

	async function loadWorkspaceCollectionItems(
		config: DiscoveredConfig,
		options?: { force?: boolean; hydrateRemaining?: boolean }
	) {
		if (!config.config.collection) {
			return;
		}

		if (!isLocalMode) {
			const status = getGitHubCollectionStatus(config.slug);
			if (
				!options?.force &&
				!options?.hydrateRemaining &&
				(status === 'loading' || status === 'ready')
			) {
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
		}

		try {
			await runWorkspaceIntent({
				type: 'load-collection-navigation',
				config,
				force: options?.force,
				hydrateRemaining: options?.hydrateRemaining
			});
		} catch (error) {
			if (isLocalMode) {
				console.error(`Failed to load local collection items for ${config.slug}:`, error);
				localCollectionItemsBySlug = {
					...localCollectionItemsBySlug,
					[config.slug]: {
						items: [],
						groups: []
					}
				};
				return;
			}

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

	async function loadWorkspaceConfigStates(options?: { force?: boolean }) {
		if (!isLocalMode && !options?.force && (githubConfigStatesLoaded || githubConfigStatesLoading)) {
			return;
		}

		if (!isLocalMode) {
			githubConfigStatesLoading = true;
		}

		try {
			await runWorkspaceIntent({
				type: 'load-config-states',
				force: options?.force
			});
		} catch (error) {
			console.error('Failed to load config states:', error);
		} finally {
			if (!isLocalMode) {
				githubConfigStatesLoading = false;
			}
		}
	}

	async function startNavigationEditing() {
		if (!canEditNavigation || preparingNavigationEditor || savingNavigation) {
			return;
		}

		preparingNavigationEditor = true;

		try {
			if (!isLocalMode) {
				await Promise.all(
					configs
						.filter((config: DiscoveredConfig) => config.config.collection)
						.map((config: DiscoveredConfig) => loadWorkspaceCollectionItems(config))
				);
			}

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
			await runWorkspaceIntent({ type: 'save-navigation', manifest });
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
			await runWorkspaceIntent({ type: 'save-collection-order', config, collection });
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
		const consumer = getWorkspaceConsumer();
		void consumer.run({ type: 'start-workspace' });

		return () => {
			void consumer.run({ type: 'stop-workspace' });
		};
	});

	$effect(() => {
		if (!isLocalMode || $localContent.status !== 'ready') {
			return;
		}

		void Promise.all(
			configs
				.filter((config: DiscoveredConfig) => config.config.collection)
				.map((config: DiscoveredConfig) => loadWorkspaceCollectionItems(config, { force: true }))
		);
		void loadWorkspaceConfigStates({ force: true });
	});

	$effect(() => {
		if (isLocalMode || isEditingNavigation) {
			return;
		}

		if (currentConfig?.config.collection) {
			const unsubscribe = getWorkspaceConsumer().watchCollectionNavigation(
				currentConfig.slug,
				(result) => {
					void applyWorkspaceResult(result);
				}
			);
			void loadWorkspaceCollectionItems(currentConfig);
			void loadWorkspaceConfigStates();
			return unsubscribe;
		}

		void loadWorkspaceConfigStates();
	});

	$effect(() => {
		const routeKey = `${page.url.pathname}?${page.url.search}`;

		if (!routeKey) {
			return;
		}

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

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>

<div
	class="grid h-dvh overflow-hidden bg-white text-stone-950 lg:grid-cols-[15.5rem_minmax(0,1fr)]"
	data-sveltekit-preload-data="hover"
>
	<div class="hidden lg:block">
		{#key localWorkspaceSurfaceKey}
			<Sidebar
				{siteName}
				{repoLabel}
				{configs}
				{configStatesBySlug}
				{currentPageSlug}
				isAuthenticated={data.isAuthenticated}
				{isLocalMode}
				cacheWarmStatus={$githubCacheWarmStatus}
				{canEditNavigation}
				{canAddPage}
				{isEditingNavigation}
				{preparingNavigationEditor}
				{savingNavigation}
				{hasUnsavedNavigationChanges}
				{topLevelEditorItems}
				onselectconfig={handleSidebarConfigSelect}
				onpromoteroute={handlePromoteConfig}
				onstartnavigationedit={() => void startNavigationEditing()}
				oncancelnavigationedit={cancelNavigationEditing}
				onsavenavigationedit={() => void saveNavigationEditing()}
				onnavconsider={handleTopLevelConsider}
				onnavfinalize={handleTopLevelFinalize}
				onswitchsite={() => void handleSwitchSite()}
				onrescan={() => void handleRescanLocalRepo()}
				onclearcache={() => void handleClearGitHubCache()}
			/>
		{/key}
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
				{#key localWorkspaceSurfaceKey}
					<Sidebar
						{siteName}
						{repoLabel}
						{configs}
						{configStatesBySlug}
						{currentPageSlug}
						isAuthenticated={data.isAuthenticated}
						{isLocalMode}
						cacheWarmStatus={$githubCacheWarmStatus}
						{canEditNavigation}
						{canAddPage}
						{isEditingNavigation}
						{preparingNavigationEditor}
						{savingNavigation}
						{hasUnsavedNavigationChanges}
						{topLevelEditorItems}
						onselectconfig={handleSidebarConfigSelect}
						onpromoteroute={handlePromoteConfig}
						mobile={true}
						onclose={() => (isMobileSidebarOpen = false)}
						onstartnavigationedit={() => void startNavigationEditing()}
						oncancelnavigationedit={cancelNavigationEditing}
						onsavenavigationedit={() => void saveNavigationEditing()}
						onnavconsider={handleTopLevelConsider}
						onnavfinalize={handleTopLevelFinalize}
						onswitchsite={() => void handleSwitchSite()}
						onrescan={() => void handleRescanLocalRepo()}
						onclearcache={() => void handleClearGitHubCache()}
					/>
				{/key}
			</div>
		</div>
	{/if}

	<main class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
		<Header
			title={workspaceTitle}
			state={currentConfigState}
			{previewUrl}
			showPublish={data.isAuthenticated && !!$draftBranch.branchName}
			{publishHref}
			publishLoading={openingPublishReview}
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
				{@const sortCapabilities = resolveCollectionSortCapabilities(currentConfig.config, {
					canOrderItems: !!collectionSetup?.canOrderItems
				})}
				<div class="hidden min-h-0 min-w-0 lg:grid">
					{#key localWorkspaceSurfaceKey}
						<CollectionPanel
							slug={currentConfig.slug}
							label={currentConfig.config.label}
							itemLabel={getConfigItemLabel(currentConfig.config)}
							items={navigation.items}
							groups={navigation.groups}
							{currentItemId}
							status={getCollectionLoadStatus(currentConfig.slug)}
							error={getCollectionLoadError(currentConfig.slug)}
							{sortCapabilities}
							searchEnabled={isCollectionSearchEnabled(currentConfig.config)}
							canOrderItems={!!collectionSetup?.canOrderItems}
							canManageGroups={!!collectionSetup?.groupManagementEnabled}
							savingCustomOrder={savingCollectionOrder}
							onretry={() =>
								void loadWorkspaceCollectionItems(currentConfig, {
									force: true,
									hydrateRemaining: true
								})}
							onrequestsorthydration={() =>
								void loadWorkspaceCollectionItems(currentConfig, { hydrateRemaining: true })}
							onpromoteitem={(item) =>
								handlePromoteCollectionItem(currentConfig.slug, item.hrefItemId ?? item.itemId)}
							onsavecustomorder={(collection: NavigationDraftCollection) =>
								void saveCollectionCustomOrder(currentConfig, collection)}
						/>
					{/key}
				</div>
			{/if}

			<section
				class="relative min-h-0 min-w-0 overflow-y-auto px-4 sm:px-6"
				data-testid="pages-main-panel"
			>
				<div
					class="mx-auto w-full max-w-(--workspace-content-max-width) pt-4 sm:pt-6"
					style={`--workspace-content-max-width: ${isEditorRoute ? '72rem' : '44rem'}`}
				>
					{#if currentConfigIssues.length > 0}
						<section class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
							<h2 class="text-sm font-semibold text-amber-950">
								Configuration warnings for {currentConfig?.config.label}
							</h2>
							<ul class="mt-2 space-y-1 text-sm text-amber-900">
								{#each currentConfigIssues as issue (`${issue.code}:${issue.blockId ?? 'config'}:${issue.binding ?? issue.message}`)}
									<li>{issue.message}</li>
								{/each}
							</ul>
						</section>
					{/if}
					{#key mainPanelKey}
						{@render children?.()}
					{/key}
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
	{@const sortCapabilities = resolveCollectionSortCapabilities(currentConfig.config, {
		canOrderItems: !!collectionSetup?.canOrderItems
	})}
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
			{#key localWorkspaceSurfaceKey}
				<CollectionPanel
					slug={currentConfig.slug}
					label={currentConfig.config.label}
					itemLabel={getConfigItemLabel(currentConfig.config)}
					items={navigation.items}
					groups={navigation.groups}
					{currentItemId}
					status={getCollectionLoadStatus(currentConfig.slug)}
					error={getCollectionLoadError(currentConfig.slug)}
					{sortCapabilities}
					searchEnabled={isCollectionSearchEnabled(currentConfig.config)}
					canOrderItems={!!collectionSetup?.canOrderItems}
					canManageGroups={!!collectionSetup?.groupManagementEnabled}
					savingCustomOrder={savingCollectionOrder}
					onretry={() =>
						void loadWorkspaceCollectionItems(currentConfig, {
							force: true,
							hydrateRemaining: true
						})}
					onrequestsorthydration={() =>
						void loadWorkspaceCollectionItems(currentConfig, { hydrateRemaining: true })}
					onpromoteitem={(item) =>
						handlePromoteCollectionItem(currentConfig.slug, item.hrefItemId ?? item.itemId)}
					onsavecustomorder={(collection: NavigationDraftCollection) =>
						void saveCollectionCustomOrder(currentConfig, collection)}
				/>
			{/key}
		</div>
	</div>
{/if}

{#if $activeSidePanel && !isDesktopViewport}
	<div class="fixed inset-0 z-30 bg-white lg:hidden" data-testid="pages-mobile-side-panel">
		<SidePanelHost panel={$activeSidePanel} framed={false} />
	</div>
{/if}
