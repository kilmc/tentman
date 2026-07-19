import type { DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import { findContentItemByRoute } from '$lib/features/content-management/item';
import {
	getOrderedCollectionNavigation,
	type OrderedCollectionNavigation
} from '$lib/features/content-management/navigation';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import {
	resolveContentDocumentState,
	type ResolvedContentState
} from '$lib/features/content-management/state';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	createWorkflowCacheMissResult,
	createWorkflowCollectionNavigationData,
	createWorkflowConfigStatesData,
	createWorkflowRouteDataIdentity,
	createWorkflowItemViewData,
	createWorkflowPageViewData,
	type WorkflowCollectionNavigationData,
	type WorkflowConfigStatesData,
	type WorkflowRouteDataIdentity,
	type WorkflowItemViewData,
	type WorkflowPageViewData
} from '$lib/repository/workflow-data';
import { getCachedContent } from '$lib/stores/content-cache';
import { logRouteDataFallback } from '$lib/utils/workflow-instrumentation';
import {
	getCollectionNavigation,
	resolveCollectionItemDocument,
	getSingletonConfigStateResult,
	getSingletonDocument
} from '$lib/server/repository-data';

// Route endpoints prefer repository-data indexes, then preserve legacy content-cache fallback
// for local mode and GitHub source shapes that are not yet fully indexable.
export type RepositoryRouteDataSource = 'repository-data' | 'legacy-content-cache';

export interface ResolvedCollectionNavigation {
	navigation: OrderedCollectionNavigation;
	source: RepositoryRouteDataSource;
	workflowData: WorkflowCollectionNavigationData;
}

export interface ResolvedPageViewContent {
	content: ContentDocument | null;
	collectionNavigation: OrderedCollectionNavigation | null;
	source: RepositoryRouteDataSource;
	workflowData: WorkflowPageViewData;
}

export interface ResolvedSingletonConfigStates {
	statesBySlug: Record<string, ResolvedContentState>;
	source: RepositoryRouteDataSource;
	stateConfigCount: number;
	workflowData: WorkflowConfigStatesData;
}

export interface ResolvedCollectionItemRouteData {
	item: ContentRecord | null;
	source: RepositoryRouteDataSource;
	workflowData: WorkflowItemViewData;
}

function createCollectionItemCacheMiss(slug: string, itemId: string) {
	return createWorkflowCacheMissResult({
		target: 'item-view',
		slug,
		itemId,
		reason: 'prepared item view unavailable'
	});
}

function createCollectionItemFallbackRouteData(input: {
	discoveredConfig: DiscoveredConfig;
	itemId: string;
	item: ContentRecord | null;
}): ResolvedCollectionItemRouteData {
	return {
		item: input.item,
		source: 'legacy-content-cache',
		workflowData: createWorkflowItemViewData({
			slug: input.discoveredConfig.slug,
			itemId: input.itemId,
			discoveredConfig: input.discoveredConfig,
			item: input.item,
			cacheMiss: createCollectionItemCacheMiss(input.discoveredConfig.slug, input.itemId)
		})
	};
}

export async function resolveCollectionNavigationForRoute({
	backend,
	discoveredConfig,
	navigationManifest,
	rootConfig
}: {
	backend: RepositoryBackend;
	discoveredConfig: DiscoveredConfig;
	navigationManifest: NavigationManifest | null | undefined;
	rootConfig: RootConfig | null;
}): Promise<ResolvedCollectionNavigation> {
	const indexedNavigation = await getCollectionNavigation({
		backend,
		slug: discoveredConfig.slug
	});
	if (indexedNavigation) {
		return {
			navigation: indexedNavigation,
			source: 'repository-data',
			workflowData: createWorkflowCollectionNavigationData({
				slug: discoveredConfig.slug,
				navigation: indexedNavigation
			})
		};
	}

	logRouteDataFallback({
		route: `/pages/${discoveredConfig.slug}`,
		slug: discoveredConfig.slug,
		source: 'legacy-content-cache',
		reason: 'collection navigation index unavailable'
	});
	const content = await getCachedContent(
		backend,
		discoveredConfig.config,
		discoveredConfig.path,
		discoveredConfig.slug
	);

	const navigation = getOrderedCollectionNavigation(
		discoveredConfig.config,
		content,
		navigationManifest,
		rootConfig
	);

	return {
		navigation,
		source: 'legacy-content-cache',
		workflowData: createWorkflowCollectionNavigationData({
			slug: discoveredConfig.slug,
			navigation,
			cacheMiss: createWorkflowCacheMissResult({
				target: 'collection-navigation',
				slug: discoveredConfig.slug,
				reason: 'prepared collection navigation unavailable'
			})
		})
	};
}

export async function resolvePageViewContentForRoute({
	backend,
	discoveredConfig
}: {
	backend: RepositoryBackend;
	discoveredConfig: DiscoveredConfig;
}): Promise<ResolvedPageViewContent> {
	if (discoveredConfig.config.collection) {
		const indexedNavigation = await getCollectionNavigation({
			backend,
			slug: discoveredConfig.slug
		});
		if (indexedNavigation) {
			return {
				content: null,
				collectionNavigation: indexedNavigation,
				source: 'repository-data',
				workflowData: createWorkflowPageViewData({
					slug: discoveredConfig.slug,
					discoveredConfig,
					content: null,
					collectionNavigation: indexedNavigation
				})
			};
		}
		logRouteDataFallback({
			route: `/pages/${discoveredConfig.slug}`,
			slug: discoveredConfig.slug,
			source: 'legacy-content-cache',
			reason: 'collection page-view index unavailable'
		});
	} else {
		const singletonContent = await getSingletonDocument({
			backend,
			slug: discoveredConfig.slug
		});
		if (singletonContent !== null) {
			return {
				content: singletonContent,
				collectionNavigation: null,
				source: 'repository-data',
				workflowData: createWorkflowPageViewData({
					slug: discoveredConfig.slug,
					discoveredConfig,
					content: singletonContent,
					collectionNavigation: null
				})
			};
		}
		logRouteDataFallback({
			route: `/pages/${discoveredConfig.slug}`,
			slug: discoveredConfig.slug,
			source: 'legacy-content-cache',
			reason: 'singleton document index unavailable'
		});
	}

	const content = await getCachedContent(
		backend,
		discoveredConfig.config,
		discoveredConfig.path,
		discoveredConfig.slug
	);

	return {
		content,
		collectionNavigation: null,
		source: 'legacy-content-cache',
		workflowData: createWorkflowPageViewData({
			slug: discoveredConfig.slug,
			discoveredConfig,
			content,
			collectionNavigation: null,
			cacheMiss: createWorkflowCacheMissResult({
				target: 'page-view',
				slug: discoveredConfig.slug,
				reason: discoveredConfig.config.collection
					? 'prepared collection page view unavailable'
					: 'prepared page view unavailable'
			})
		})
	};
}

export async function resolveSingletonConfigStatesForRoute({
	backend,
	hasEditableDraft,
	workflowIdentity,
	configs,
	rootConfig
}: {
	backend: RepositoryBackend;
	hasEditableDraft?: boolean;
	workflowIdentity?: WorkflowRouteDataIdentity | null;
	configs: DiscoveredConfig[];
	rootConfig: RootConfig | null;
}): Promise<ResolvedSingletonConfigStates> {
	const indexedStates = await resolveIndexedSingletonConfigStatesForRoute({
		backend,
		hasEditableDraft
	});
	if (indexedStates) {
		return indexedStates;
	}

	return resolveLegacySingletonConfigStatesForRoute({
		backend,
		workflowIdentity,
		configs,
		rootConfig
	});
}

export async function resolveLegacySingletonConfigStatesForRoute({
	backend,
	workflowIdentity,
	configs,
	rootConfig
}: {
	backend: RepositoryBackend;
	workflowIdentity?: WorkflowRouteDataIdentity | null;
	configs: DiscoveredConfig[];
	rootConfig: RootConfig | null;
}): Promise<ResolvedSingletonConfigStates> {
	const stateConfigs = configs.filter(
		(config) => !!config.config.state && !config.config.collection
	);
	logRouteDataFallback({
		route: '/pages',
		slug: null,
		source: 'legacy-content-cache',
		reason: 'singleton config state index unavailable'
	});
	const statesBySlugEntries = await Promise.all(
		stateConfigs.map(async (config) => {
			const content = await getCachedContent(backend, config.config, config.path, config.slug);
			const state = resolveContentDocumentState(config.config, content, rootConfig);

			return [config.slug, state] as const;
		})
	);

	const statesBySlug = Object.fromEntries(
		statesBySlugEntries.flatMap(([slug, state]) => (state ? ([[slug, state]] as const) : []))
	);

	return {
		statesBySlug,
		source: 'legacy-content-cache',
		stateConfigCount: stateConfigs.length,
		workflowData: createWorkflowConfigStatesData({
			identity: workflowIdentity ?? null,
			statesBySlug,
			stateConfigCount: stateConfigs.length,
			cacheMiss: createWorkflowCacheMissResult({
				target: 'config-states',
				reason: 'prepared config states unavailable'
			})
		})
	};
}

export async function resolveIndexedSingletonConfigStatesForRoute({
	backend,
	hasEditableDraft
}: {
	backend: RepositoryBackend;
	hasEditableDraft?: boolean;
}): Promise<ResolvedSingletonConfigStates | null> {
	const indexedStates = await getSingletonConfigStateResult({ backend });
	if (indexedStates) {
		return {
			statesBySlug: indexedStates.statesBySlug,
			source: 'repository-data',
			stateConfigCount: indexedStates.stateConfigCount,
			workflowData: createWorkflowConfigStatesData({
				identity: createWorkflowRouteDataIdentity(indexedStates.identity, {
					hasEditableDraft: hasEditableDraft ?? false
				}),
				statesBySlug: indexedStates.statesBySlug,
				stateConfigCount: indexedStates.stateConfigCount
			})
		};
	}
	return null;
}

export async function resolveCollectionItemRouteData({
	backend,
	discoveredConfig,
	itemId
}: {
	backend: RepositoryBackend;
	discoveredConfig: DiscoveredConfig;
	itemId: string;
}): Promise<ResolvedCollectionItemRouteData> {
	const resolvedItem = await resolveCollectionItemDocument({
		backend,
		slug: discoveredConfig.slug,
		itemId
	});
	if (resolvedItem) {
		return {
			item: resolvedItem.content,
			source: 'repository-data',
			workflowData: createWorkflowItemViewData({
				slug: discoveredConfig.slug,
				itemId,
				discoveredConfig,
				item: resolvedItem.content
			})
		};
	}

	logRouteDataFallback({
		route: `/pages/${discoveredConfig.slug}/${itemId}`,
		slug: discoveredConfig.slug,
		itemId,
		source: 'legacy-content-cache',
		reason: 'collection item document index unavailable'
	});
	const content = await getCachedContent(
		backend,
		discoveredConfig.config,
		discoveredConfig.path,
		discoveredConfig.slug
	);

	if (!Array.isArray(content)) {
		return createCollectionItemFallbackRouteData({ discoveredConfig, itemId, item: null });
	}

	const routeItem = findContentItemByRoute(content, discoveredConfig.config, itemId);
	if (routeItem) {
		return createCollectionItemFallbackRouteData({ discoveredConfig, itemId, item: routeItem });
	}

	if (discoveredConfig.config.content.mode !== 'file') {
		return createCollectionItemFallbackRouteData({ discoveredConfig, itemId, item: null });
	}

	const index = Number.parseInt(itemId, 10);
	if (Number.isNaN(index) || index < 0 || index >= content.length) {
		return createCollectionItemFallbackRouteData({ discoveredConfig, itemId, item: null });
	}

	const item = content[index] ?? null;
	return createCollectionItemFallbackRouteData({ discoveredConfig, itemId, item });
}

export async function resolveCollectionItemForRoute(input: {
	backend: RepositoryBackend;
	discoveredConfig: DiscoveredConfig;
	itemId: string;
}): Promise<ContentRecord | null> {
	const routeData = await resolveCollectionItemRouteData(input);
	return routeData.item;
}
