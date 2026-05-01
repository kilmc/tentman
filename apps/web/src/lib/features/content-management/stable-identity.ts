import type { ParsedContentConfig } from '$lib/config/parse';
import type { RootConfig } from '$lib/config/root-config';
import type { CollectionGroupConfig } from '$lib/config/types';
import { isCollectionManualSortingEnabled } from './config';
import { isTopLevelManualSortingEnabled } from './config';
import { getItemFilename, getItemSlug } from './item';
import type { ContentRecord } from './types';

const GENERATED_TENTMAN_ID_MARKER = '__tentmanGeneratedTentmanId';

export function createTentmanId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugifyTentmanIdBase(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || 'item';
}

function stripExtension(filename: string): string {
	return filename.replace(/\.[^.]+$/, '');
}

function createUniqueTentmanId(base: string, usedIds: Set<string>): string {
	const normalizedBase = slugifyTentmanIdBase(base);

	if (!usedIds.has(normalizedBase)) {
		usedIds.add(normalizedBase);
		return normalizedBase;
	}

	let suffix = 2;
	while (usedIds.has(`${normalizedBase}-${suffix}`)) {
		suffix += 1;
	}

	const nextId = `${normalizedBase}-${suffix}`;
	usedIds.add(nextId);
	return nextId;
}

function markTentmanIdAsGenerated<T extends { _tentmanId?: string }>(value: T): T {
	Object.defineProperty(value, GENERATED_TENTMAN_ID_MARKER, {
		value: true,
		enumerable: false,
		configurable: true
	});

	return value;
}

export function hasGeneratedTentmanId(value: unknown): boolean {
	return !!value && typeof value === 'object' && GENERATED_TENTMAN_ID_MARKER in value;
}

function withTentmanId<T extends { _tentmanId?: string }>(
	value: T,
	tentmanId: string,
	options?: { generated?: boolean }
): T {
	const nextValue =
		value._tentmanId === tentmanId && (!options?.generated || hasGeneratedTentmanId(value))
			? value
			: ({ ...value, _tentmanId: tentmanId } as T);

	if (options?.generated) {
		return markTentmanIdAsGenerated(nextValue);
	}

	return nextValue;
}

function normalizeRuntimeCollectionGroups(config: ParsedContentConfig): ParsedContentConfig {
	if (!isCollectionManualSortingEnabled(config) || config.collection === true || !config.collection) {
		return config;
	}

	const groups = config.collection.groups ?? [];
	if (groups.length === 0) {
		return config;
	}

	const usedIds = new Set<string>();
	let changed = false;
	const nextGroups: CollectionGroupConfig[] = groups.map((group, index) => {
		const currentId =
			typeof group._tentmanId === 'string' &&
			group._tentmanId.length > 0 &&
			!usedIds.has(group._tentmanId)
				? group._tentmanId
				: null;

		if (currentId) {
			usedIds.add(currentId);
			return group;
		}

		changed = true;
		return withTentmanId(
			group,
			createUniqueTentmanId(group.value ?? group.label ?? `group-${index + 1}`, usedIds),
			{ generated: true }
		);
	});

	if (!changed) {
		return config;
	}

	const nextConfig = {
		...config,
		collection: {
			...config.collection,
			groups: nextGroups
		}
	};

	return hasGeneratedTentmanId(config) ? markTentmanIdAsGenerated(nextConfig) : nextConfig;
}

export function normalizeRuntimeDiscoveredConfigIdentity<
	T extends { slug: string; config: ParsedContentConfig }
>(configs: T[], rootConfig?: RootConfig | null): T[] {
	const usedConfigIds = new Set<string>();

	return configs.map((discoveredConfig) => {
		const needsConfigId =
			isTopLevelManualSortingEnabled(rootConfig) ||
			isCollectionManualSortingEnabled(discoveredConfig.config);
		const currentId = discoveredConfig.config._tentmanId;
		const uniqueCurrentId =
			needsConfigId &&
			typeof currentId === 'string' &&
			currentId.length > 0 &&
			!usedConfigIds.has(currentId)
				? currentId
				: null;
		let nextConfig = discoveredConfig.config;

		if (uniqueCurrentId) {
			usedConfigIds.add(uniqueCurrentId);
		} else if (needsConfigId) {
			nextConfig = withTentmanId(
				nextConfig,
				createUniqueTentmanId(nextConfig.id ?? discoveredConfig.slug, usedConfigIds),
				{ generated: true }
			);
		}

		nextConfig = normalizeRuntimeCollectionGroups(nextConfig);

		return nextConfig === discoveredConfig.config
			? discoveredConfig
			: {
					...discoveredConfig,
					config: nextConfig
				};
	});
}

export function normalizeRuntimeCollectionItemIds(
	config: ParsedContentConfig,
	items: ContentRecord[]
): ContentRecord[] {
	if (!isCollectionManualSortingEnabled(config)) {
		return items;
	}

	const usedIds = new Set<string>();
	let changed = false;
	const nextItems = items.map((item, index) => {
		const currentId =
			typeof item._tentmanId === 'string' &&
			item._tentmanId.length > 0 &&
			!hasGeneratedTentmanId(item) &&
			!usedIds.has(item._tentmanId)
				? item._tentmanId
				: null;

		if (currentId) {
			usedIds.add(currentId);
			return item;
		}

		changed = true;
		return withTentmanId(
			item,
			createUniqueTentmanId(
				getItemSlug(config, item) ??
					(getItemFilename(item) ? stripExtension(getItemFilename(item)!) : undefined) ??
					`${config.label}-item-${index + 1}`,
				usedIds
			),
			{ generated: true }
		);
	});

	return changed ? nextItems : items;
}

export function ensureTentmanItemId(
	config: { collection?: unknown },
	item: ContentRecord
): ContentRecord {
	if (!isCollectionManualSortingEnabled(config as never)) {
		return item;
	}

	if (typeof item._tentmanId === 'string' && item._tentmanId.length > 0) {
		return item;
	}

	return {
		...item,
		_tentmanId: createTentmanId()
	};
}
