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

export function isCollectionOrderingEnabled(config: ContentConfig): boolean {
	return getCollectionConfig(config.collection)?.ordering === true;
}

export function isCollectionGroupManagementEnabled(config: ContentConfig): boolean {
	return getCollectionConfig(config.collection)?.groupManagement === true;
}

export function isCollectionManifestBacked(config: ContentConfig): boolean {
	const collection = getCollectionConfig(config.collection);
	return collection?.ordering === true || collection?.groupManagement === true;
}

export function getCollectionConfigReferences(config: ContentConfig & { slug?: string }): string[] {
	const seen = new Set<string>();
	const references = [config._tentmanId, config.id, config.slug].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);

	return references.filter((reference) => {
		if (seen.has(reference)) {
			return false;
		}

		seen.add(reference);
		return true;
	});
}

export function getCollectionGroups(config: ContentConfig): CollectionGroupConfig[] {
	return getCollectionConfig(config.collection)?.groups ?? [];
}

export function isTopLevelManualSortingEnabled(
	rootConfig: { content?: { sorting?: 'manual' } } | null | undefined
): boolean {
	return rootConfig?.content?.sorting === 'manual';
}
