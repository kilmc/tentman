<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
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
		getOrderedCollectionNavigation,
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
		saveCollectionOrder,
		writeNavigationManifest
	} from '$lib/features/content-management/navigation-manifest';
	import { resolveCollectionSortCapabilities } from '$lib/features/content-management/collection-sorts';
	import { draftBranch } from '$lib/stores/draft-branch';
	import {
		githubCacheWarmStatus,
		githubRepositoryCache
	} from '$lib/stores/github-repository-cache';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';
	import { buildContentTitleContext, formatAppTitle } from '$lib/utils/page-title';
	import { traceRouting } from '$lib/utils/routing-trace';
	import { toasts } from '$lib/stores/toasts';
	import { buildReposRedirect } from '$lib/utils/routing';

	let { children, data } = $props<{ children?: Snippet; data: LayoutData }>();

	type CollectionItemsBySlug = Record<string, OrderedCollectionNavigation>;
	type ConfigStatesBySlug = Record<string, ResolvedContentState | null>;
	type CollectionLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

	const GITHUB_PAGES_INVALIDATION_PATHS = new Set([
		'/api/repo/collection-items',
		'/api/repo/collection-index',
		'/api/repo/collection-projections',
		'/api/repo/config-states',
		'/api/repo/configs',
		'/api/repo/draft-status',
		'/api/repo/form-config',
		'/api/repo/instructions',
		'/api/repo/pages-summary'
	]);

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
	let localConfigStatesBySlug = $state<ConfigStatesBySlug>({});
	let githubConfigStatesBySlug = $state<ConfigStatesBySlug>({});
	let githubConfigStatesLoaded = $state(false);
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
	const previewUrl = $derived.by(() => {
		if (isLocalMode) {
			return $localContent.rootConfig?.local?.previewUrl ?? null;
		}

		const netlifySiteName = data.rootConfig?.netlify?.siteName;
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

	$effect(() => {
		if (!data.selectedRepo || isLocalMode) {
			return;
		}

		let cancelled = false;
		let stopFreshnessScheduler: (() => void) | null = null;

		void (async () => {
			await githubRepositoryCache.hydrateFromBootstrap({
				repoFullName: data.selectedRepo!.full_name,
				bootstrap: data
			});

			if (!cancelled) {
				stopFreshnessScheduler = githubRepositoryCache.startFreshnessScheduler({ fetcher: fetch });
			}
		})();

		const repoFullName = `${data.selectedRepo.owner}/${data.selectedRepo.name}`;
		if (data.activeDraftBranch) {
			draftBranch.setBranch(data.activeDraftBranch, repoFullName);
		} else if (draftBranch.hasDraft(repoFullName)) {
			draftBranch.clear();
		}

		return () => {
			cancelled = true;
			stopFreshnessScheduler?.();
		};
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

	function getConfigsWithTopLevelState(nextConfigs: DiscoveredConfig[]) {
		return nextConfigs.filter((config) => !!config.config.state);
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

	function shouldInvalidateGitHubPagesData(url: URL): boolean {
		return GITHUB_PAGES_INVALIDATION_PATHS.has(url.pathname);
	}

	async function invalidateGitHubPagesData() {
		if (data.selectedRepo) {
			await githubRepositoryCache.invalidatePaths(['tentman/navigation-manifest.json']);
		}
		await Promise.all([invalidate('app:content'), invalidate(shouldInvalidateGitHubPagesData)]);
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

	async function handleClearGitHubCache() {
		if (isLocalMode || !data.selectedRepo || !data.repositoryIdentity) {
			return;
		}

		try {
			await githubRepositoryCache.clearRepoRef({
				repoFullName: data.selectedRepo.full_name,
				ref: data.repositoryIdentity.ref
			});
			await githubRepositoryCache.hydrateFromBootstrap({
				repoFullName: data.selectedRepo.full_name,
				bootstrap: data
			});
			githubRepositoryCache.resetFreshnessSchedule();
			githubCollectionItemsBySlug = {};
			githubCollectionLoadStatusBySlug = {};
			githubCollectionErrorBySlug = {};
			githubConfigStatesLoaded = false;
			if (currentConfig?.config.collection) {
				await loadGitHubCollectionItems(currentConfig, { force: true });
			}
			toasts.success('GitHub cache cleared.');
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
		if (isLocalMode) {
			return;
		}

		githubRepositoryCache.promoteRoute({
			slug: config.slug,
			fetcher: fetch
		});
	}

	function handlePromoteCollectionItem(slug: string, itemId: string) {
		if (isLocalMode) {
			return;
		}

		githubRepositoryCache.promoteRoute({
			slug,
			itemId,
			fetcher: fetch
		});
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

		const cachedNavigation = !options?.force
			? await githubRepositoryCache.getCollectionNavigation(config.slug)
			: null;
		if (cachedNavigation) {
			githubCollectionItemsBySlug = {
				...githubCollectionItemsBySlug,
				[config.slug]: cachedNavigation
			};
			githubCollectionLoadStatusBySlug = {
				...githubCollectionLoadStatusBySlug,
				[config.slug]: 'ready'
			};
		} else {
			githubCollectionLoadStatusBySlug = {
				...githubCollectionLoadStatusBySlug,
				[config.slug]: 'loading'
			};
		}
		githubCollectionErrorBySlug = {
			...githubCollectionErrorBySlug,
			[config.slug]: null
		};

		try {
			await githubRepositoryCache.warmCollection(config.slug, {
				fetcher: fetch,
				force: options?.force,
				hydrateRemaining: false,
				warmDocuments: false
			});
			const payload = await githubRepositoryCache.getCollectionNavigation(config.slug);
			if (!payload) {
				throw new Error('Failed to load collection navigation');
			}

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
							getOrderedCollectionNavigation(config.config, content, navigationManifest, rootConfig)
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

	async function loadLocalConfigStates(nextConfigs: DiscoveredConfig[]) {
		const repoState = get(localRepo);
		if (!repoState.backend) {
			localConfigStatesBySlug = {};
			return;
		}

		const stateEntries = await Promise.all(
			getConfigsWithTopLevelState(nextConfigs).map(async (config) => {
				try {
					const content = await fetchContentDocument(
						repoState.backend!,
						config.config,
						config.path
					);

					return [
						config.slug,
						resolveContentDocumentState(config.config, content, rootConfig)
					] as const;
				} catch (error) {
					console.error(`Failed to load config state for ${config.slug}:`, error);
					return [config.slug, null] as const;
				}
			})
		);

		localConfigStatesBySlug = Object.fromEntries(stateEntries);
	}

	async function loadGitHubConfigStates(options?: { force?: boolean }) {
		if (isLocalMode) {
			return;
		}

		if (!options?.force && githubConfigStatesLoaded) {
			return;
		}

		try {
			const response = await fetch(resolve('/api/repo/config-states'));

			if (response.status === 401) {
				await redirectToReposForExpiredSession();
				return;
			}

			if (!response.ok) {
				throw new Error(`Failed to load config states (${response.status})`);
			}

			const payload = (await response.json()) as {
				statesBySlug?: ConfigStatesBySlug;
			};

			githubConfigStatesBySlug = payload.statesBySlug ?? {};
			githubConfigStatesLoaded = true;
		} catch (error) {
			console.error('Failed to load config states:', error);
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
						.map((config: DiscoveredConfig) => loadGitHubCollectionItems(config))
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
				await loadLocalConfigStates(configs);
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

				const result = (await response.json()) as {
					branchName?: string | null;
				};
				if (result.branchName && data.selectedRepo) {
					draftBranch.setBranch(result.branchName, data.selectedRepo.full_name);
				}
			}

			cancelNavigationEditing();
			await invalidateGitHubPagesData();
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
				await loadLocalConfigStates(configs);
			} else {
				const response = await fetch('/api/repo/navigation-manifest', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						action: 'save-collection-order',
						collection: config.slug,
						order: collection
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

			await invalidateGitHubPagesData();
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
		void loadLocalConfigStates(configs);
	});

	$effect(() => {
		if (isLocalMode || isEditingNavigation) {
			return;
		}

		if (currentConfig?.config.collection) {
			const unsubscribe = githubRepositoryCache.onCollectionChange(
				currentConfig.slug,
				(navigation) => {
					if (!navigation) {
						return;
					}

					githubCollectionItemsBySlug = {
						...githubCollectionItemsBySlug,
						[currentConfig.slug]: navigation
					};
					githubCollectionLoadStatusBySlug = {
						...githubCollectionLoadStatusBySlug,
						[currentConfig.slug]: 'ready'
					};
				}
			);
			void loadGitHubCollectionItems(currentConfig);
			void loadGitHubConfigStates();
			return unsubscribe;
		}

		void loadGitHubConfigStates();
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
							canOrderItems={!!collectionSetup?.canOrderItems}
							canManageGroups={!!collectionSetup?.groupManagementEnabled}
							savingCustomOrder={savingCollectionOrder}
							onretry={() => void loadGitHubCollectionItems(currentConfig, { force: true })}
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
					canOrderItems={!!collectionSetup?.canOrderItems}
					canManageGroups={!!collectionSetup?.groupManagementEnabled}
					savingCustomOrder={savingCollectionOrder}
					onretry={() => void loadGitHubCollectionItems(currentConfig, { force: true })}
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
