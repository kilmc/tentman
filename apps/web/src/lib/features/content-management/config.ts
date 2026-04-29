import type {
	CollectionBehaviorConfig,
	CollectionGroupConfig,
	ContentConfig
} from '$lib/config/types';

export function isCollectionConfig(
	collection: ContentConfig['collection']
): collection is true | CollectionBehaviorConfig {
	return collection === true || (!!collection && typeof collection === 'object');
}

export function getCollectionConfig(
	collection: ContentConfig['collection']
): CollectionBehaviorConfig | null {
	if (!collection || collection === true) {
		return null;
	}

	return collection;
}

export function isCollectionManualSortingEnabled(config: ContentConfig): boolean {
	return getCollectionConfig(config.collection)?.sorting === 'manual';
}

export function getCollectionGroups(config: ContentConfig): CollectionGroupConfig[] {
	return getCollectionConfig(config.collection)?.groups ?? [];
}

export function isTopLevelManualSortingEnabled(
	rootConfig: { content?: { sorting?: 'manual' } } | null | undefined
): boolean {
	return rootConfig?.content?.sorting === 'manual';
}
