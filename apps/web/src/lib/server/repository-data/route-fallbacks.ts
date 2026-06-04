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
import { getCachedContent } from '$lib/stores/content-cache';
import {
	getCollectionNavigation,
	getSingletonConfigStates,
	getSingletonDocument
} from '$lib/server/repository-data';

export type RepositoryRouteDataSource = 'repository-data' | 'legacy-content-cache';

export interface ResolvedCollectionNavigation {
	navigation: OrderedCollectionNavigation;
	source: RepositoryRouteDataSource;
}

export interface ResolvedPageViewContent {
	content: ContentDocument | null;
	collectionNavigation: OrderedCollectionNavigation | null;
	source: RepositoryRouteDataSource;
}

export interface ResolvedSingletonConfigStates {
	statesBySlug: Record<string, ResolvedContentState>;
	source: RepositoryRouteDataSource;
	stateConfigCount: number;
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
			source: 'repository-data'
		};
	}

	const content = await getCachedContent(
		backend,
		discoveredConfig.config,
		discoveredConfig.path,
		discoveredConfig.slug
	);

	return {
		navigation: getOrderedCollectionNavigation(
			discoveredConfig.config,
			content,
			navigationManifest,
			rootConfig
		),
		source: 'legacy-content-cache'
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
				source: 'repository-data'
			};
		}
	} else {
		const singletonContent = await getSingletonDocument({
			backend,
			slug: discoveredConfig.slug
		});
		if (singletonContent !== null) {
			return {
				content: singletonContent,
				collectionNavigation: null,
				source: 'repository-data'
			};
		}
	}

	return {
		content: await getCachedContent(
			backend,
			discoveredConfig.config,
			discoveredConfig.path,
			discoveredConfig.slug
		),
		collectionNavigation: null,
		source: 'legacy-content-cache'
	};
}

export async function resolveSingletonConfigStatesForRoute({
	backend,
	configs,
	rootConfig
}: {
	backend: RepositoryBackend;
	configs: DiscoveredConfig[];
	rootConfig: RootConfig | null;
}): Promise<ResolvedSingletonConfigStates> {
	const indexedStatesBySlug = await getSingletonConfigStates({ backend });
	if (indexedStatesBySlug) {
		return {
			statesBySlug: indexedStatesBySlug,
			source: 'repository-data',
			stateConfigCount: Object.keys(indexedStatesBySlug).length
		};
	}

	const stateConfigs = configs.filter(
		(config) => !!config.config.state && !config.config.collection
	);
	const statesBySlugEntries = await Promise.all(
		stateConfigs.map(async (config) => {
			const content = await getCachedContent(backend, config.config, config.path, config.slug);
			const state = resolveContentDocumentState(config.config, content, rootConfig);

			return [config.slug, state] as const;
		})
	);

	return {
		statesBySlug: Object.fromEntries(
			statesBySlugEntries.flatMap(([slug, state]) => (state ? ([[slug, state]] as const) : []))
		),
		source: 'legacy-content-cache',
		stateConfigCount: stateConfigs.length
	};
}

export async function resolveCollectionItemForRoute({
	backend,
	discoveredConfig,
	itemId
}: {
	backend: RepositoryBackend;
	discoveredConfig: DiscoveredConfig;
	itemId: string;
}): Promise<ContentRecord | null> {
	const content = await getCachedContent(
		backend,
		discoveredConfig.config,
		discoveredConfig.path,
		discoveredConfig.slug
	);

	if (!Array.isArray(content)) {
		return null;
	}

	const routeItem = findContentItemByRoute(content, discoveredConfig.config, itemId);
	if (routeItem) {
		return routeItem;
	}

	if (discoveredConfig.config.content.mode !== 'file') {
		return null;
	}

	const index = Number.parseInt(itemId, 10);
	if (Number.isNaN(index) || index < 0 || index >= content.length) {
		return null;
	}

	return content[index] ?? null;
}
