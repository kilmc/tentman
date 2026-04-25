import { JSONPath } from 'jsonpath-plus';
import { fetchContentDocument } from '$lib/content/service';
import type { DiscoveredConfig } from '$lib/config/discovery';
import type { CollectionGroupConfig } from '$lib/config/types';
import {
	buildCollectionFilePath,
	detectJsonIndent,
	getTemplateInfo,
	serializeCollectionItem,
	stripFileExtension,
	toJsonFileContent
} from '$lib/features/content-management/transforms';
import { resolveConfigPath } from '$lib/utils/validation';
import { getCollectionGroups, isCollectionManualSortingEnabled } from './config';
import { getItemFilename, getItemId, getItemRoute, getItemSlug } from './item';
import { hasGeneratedTentmanId } from './stable-identity';
import type { ContentRecord } from './types';
import type { RootConfig } from '$lib/config/root-config';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

export const NAVIGATION_MANIFEST_PATH = 'tentman/navigation-manifest.json';
const ROOT_CONFIG_PATH = '.tentman.json';

export interface NavigationManifestGroup {
	id: string;
	label?: string;
	slug?: string;
	items: string[];
}

export interface NavigationManifestCollection {
	items: string[];
	groups?: NavigationManifestGroup[];
}

export interface NavigationManifest {
	version: 1;
	content?: {
		items: string[];
	};
	collections?: Record<string, NavigationManifestCollection>;
}

export interface NavigationManifestState {
	path: string;
	exists: boolean;
	manifest: NavigationManifest | null;
	error: string | null;
}

export interface MissingContentConfigId {
	path: string;
	slug: string;
	label: string;
	suggestedId: string;
}

export interface ManualNavigationCollectionSetup {
	slug: string;
	label: string;
	configId: string | null;
	idField: string | null;
	manualSortingEnabled: boolean;
	canOrderItems: boolean;
	groupCount: number;
}

export interface ManualNavigationSetupState {
	status: 'inactive' | 'partial' | 'active';
	manifestPath: string;
	manifestExists: boolean;
	manifestValid: boolean;
	manifestError: string | null;
	topLevelManualSortingEnabled: boolean;
	missingConfigIds: MissingContentConfigId[];
	collections: ManualNavigationCollectionSetup[];
}

interface ItemIdentityState {
	items: ContentRecord[];
	refMap: Map<string, string>;
	changed: boolean;
}

interface GroupIdentityState {
	groups: CollectionGroupConfig[];
	refMap: Map<string, string>;
	changed: boolean;
}

interface ConfigIdentityState {
	configs: DiscoveredConfig[];
	refMap: Map<string, string>;
	changed: boolean;
}

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}
}

function readStringArray(value: unknown, context: string): string[] {
	if (!Array.isArray(value)) {
		throw new Error(`${context} must be an array of strings`);
	}

	return value.map((entry, index) => {
		if (typeof entry !== 'string' || entry.length === 0) {
			throw new Error(`${context}[${index}] must be a non-empty string`);
		}

		return entry;
	});
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const value of values) {
		if (typeof value !== 'string' || value.length === 0 || seen.has(value)) {
			continue;
		}

		seen.add(value);
		output.push(value);
	}

	return output;
}

function hasNavigationReference(
	references: Set<string>,
	candidates: Array<string | null | undefined>
): boolean {
	return candidates.some(
		(candidate) => typeof candidate === 'string' && candidate.length > 0 && references.has(candidate)
	);
}

function orderByManifestReferences(ids: string[], refMap: Map<string, string>): string[] {
	const seenIds = new Set<string>();
	const orderedIds: string[] = [];

	for (const id of ids) {
		const resolvedId = refMap.get(id) ?? id;
		if (!resolvedId || seenIds.has(resolvedId)) {
			continue;
		}

		seenIds.add(resolvedId);
		orderedIds.push(resolvedId);
	}

	return orderedIds;
}

function appendRemainingIds(orderedIds: string[], allIds: string[]): string[] {
	const seenIds = new Set(orderedIds);

	for (const id of allIds) {
		if (!id || seenIds.has(id)) {
			continue;
		}

		seenIds.add(id);
		orderedIds.push(id);
	}

	return orderedIds;
}

function getConfigReferenceCandidates(config: DiscoveredConfig): string[] {
	return uniqueStrings([config.config._tentmanId, config.config.id, config.slug]);
}

function getGroupReferenceCandidates(group: CollectionGroupConfig): string[] {
	return uniqueStrings([group._tentmanId, group.slug]);
}

function getItemReferenceCandidates(config: DiscoveredConfig, item: ContentRecord): string[] {
	const filename = getItemFilename(item);

	return uniqueStrings([
		getItemId(item),
		getItemSlug(config.config, item),
		getItemRoute(config.config, item),
		filename,
		filename ? stripFileExtension(filename) : undefined
	]);
}

function getConfigReferenceSet(manifest: NavigationManifest | null | undefined): Set<string> {
	return new Set([
		...(manifest?.content?.items ?? []),
		...Object.keys(manifest?.collections ?? {})
	]);
}

function getCollectionReferenceSet(collection: NavigationManifestCollection | null): Set<string> {
	return new Set([
		...(collection?.items ?? []),
		...(collection?.groups?.flatMap((group) => group.items) ?? [])
	]);
}

function getUniqueItemIdBase(config: DiscoveredConfig, item: ContentRecord, index: number): string {
	const filename = getItemFilename(item);

	return (
		getItemSlug(config.config, item) ??
		(filename ? stripFileExtension(filename) : undefined) ??
		`${config.slug}-item-${index + 1}`
	);
}

function getUniqueIdFromBase(base: string, existingIds: Set<string>): string {
	if (!existingIds.has(base)) {
		existingIds.add(base);
		return base;
	}

	let suffix = 2;
	while (existingIds.has(`${base}-${suffix}`)) {
		suffix += 1;
	}

	const nextId = `${base}-${suffix}`;
	existingIds.add(nextId);
	return nextId;
}

function getConfigManifestCollection(
	manifest: NavigationManifest | null | undefined,
	config: DiscoveredConfig,
	configRefMap?: Map<string, string>
): NavigationManifestCollection | null {
	if (!manifest?.collections) {
		return null;
	}

	for (const candidate of getConfigReferenceCandidates(config)) {
		const collection =
			manifest.collections[candidate] ??
			(configRefMap ? manifest.collections[configRefMap.get(candidate) ?? ''] : undefined);
		if (collection) {
			return collection;
		}
	}

	return null;
}

function cloneManifestCollection(
	collection: NavigationManifestCollection | null | undefined
): NavigationManifestCollection | null {
	if (!collection) {
		return null;
	}

	return {
		items: [...collection.items],
		...(collection.groups
			? {
					groups: collection.groups.map((group) => ({
						id: group.id,
						...(group.label ? { label: group.label } : {}),
						...(group.slug ? { slug: group.slug } : {}),
						items: [...group.items]
					}))
				}
			: {})
	};
}

function setRefMapValue(refMap: Map<string, string>, source: string, target: string): void {
	if (!source || refMap.has(source)) {
		return;
	}

	refMap.set(source, target);
}

function groupByKey<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const item of items) {
		const key = getKey(item);
		if (!key) {
			continue;
		}

		const currentGroup = groups.get(key);
		if (currentGroup) {
			currentGroup.push(item);
			continue;
		}

		groups.set(key, [item]);
	}

	return groups;
}

function parseNavigationManifestCollection(
	value: unknown,
	context: string
): NavigationManifestCollection {
	assertObject(value, `${context} must be an object`);

	const items = readStringArray(value.items ?? [], `${context}.items`);
	const groupsValue = value.groups;

	if (groupsValue === undefined) {
		return { items };
	}

	if (!Array.isArray(groupsValue)) {
		throw new Error(`${context}.groups must be an array`);
	}

	return {
		items,
		groups: groupsValue.map((group, index) => {
			assertObject(group, `${context}.groups[${index}] must be an object`);

			if (typeof group.id !== 'string' || group.id.length === 0) {
				throw new Error(`${context}.groups[${index}].id must be a non-empty string`);
			}

			if (
				group.label !== undefined &&
				(typeof group.label !== 'string' || group.label.length === 0)
			) {
				throw new Error(`${context}.groups[${index}].label must be a non-empty string when present`);
			}

			if (
				group.slug !== undefined &&
				(typeof group.slug !== 'string' || group.slug.length === 0)
			) {
				throw new Error(`${context}.groups[${index}].slug must be a non-empty string when present`);
			}

			return {
				id: group.id,
				...(group.label ? { label: group.label } : {}),
				...(group.slug ? { slug: group.slug } : {}),
				items: readStringArray(group.items ?? [], `${context}.groups[${index}].items`)
			};
		})
	};
}

export function parseNavigationManifest(input: string): NavigationManifest {
	const parsed = JSON.parse(input) as unknown;
	assertObject(parsed, 'navigation manifest must be an object');

	if (parsed.version !== 1) {
		throw new Error('navigation manifest version must be 1');
	}

	const manifest: NavigationManifest = {
		version: 1
	};

	if (parsed.content !== undefined) {
		assertObject(parsed.content, 'navigation manifest content must be an object');
		manifest.content = {
			items: readStringArray(parsed.content.items ?? [], 'navigation manifest content.items')
		};
	}

	if (parsed.collections !== undefined) {
		assertObject(parsed.collections, 'navigation manifest collections must be an object');
		manifest.collections = Object.fromEntries(
			Object.entries(parsed.collections).map(([configId, value]) => [
				configId,
				parseNavigationManifestCollection(value, `navigation manifest collections.${configId}`)
			])
		);
	}

	return manifest;
}

export function serializeNavigationManifest(manifest: NavigationManifest): string {
	return `${JSON.stringify(manifest, null, '\t')}\n`;
}

export async function loadNavigationManifestState(
	backend: RepositoryBackend,
	options?: RepositoryReadOptions
): Promise<NavigationManifestState> {
	const exists = await backend.fileExists(NAVIGATION_MANIFEST_PATH, options);

	if (!exists) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: false,
			manifest: null,
			error: null
		};
	}

	try {
		const content = await backend.readTextFile(NAVIGATION_MANIFEST_PATH, options);

		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: true,
			manifest: parseNavigationManifest(content),
			error: null
		};
	} catch (error) {
		return {
			path: NAVIGATION_MANIFEST_PATH,
			exists: true,
			manifest: null,
			error: error instanceof Error ? error.message : 'Failed to parse navigation manifest'
		};
	}
}

function getSuggestedConfigIdBase(config: DiscoveredConfig): string {
	return config.slug;
}

function getUniqueConfigId(base: string, existingIds: Set<string>): string {
	if (!existingIds.has(base)) {
		existingIds.add(base);
		return base;
	}

	let suffix = 2;
	while (existingIds.has(`${base}-${suffix}`)) {
		suffix += 1;
	}

	const nextId = `${base}-${suffix}`;
	existingIds.add(nextId);
	return nextId;
}

export function getMissingContentConfigIds(configs: DiscoveredConfig[]): MissingContentConfigId[] {
	const existingIds = new Set(
		configs
			.map((config) => config.config._tentmanId)
			.filter((configId): configId is string => typeof configId === 'string' && configId.length > 0)
	);

	return configs.flatMap((config) => {
		if (config.config._tentmanId && !hasGeneratedTentmanId(config.config)) {
			return [];
		}

		return [
			{
				path: config.path,
				slug: config.slug,
				label: config.config.label,
				suggestedId: (() => {
					if (
						typeof config.config._tentmanId === 'string' &&
						config.config._tentmanId.length > 0
					) {
						existingIds.add(config.config._tentmanId);
						return config.config._tentmanId;
					}

					return getUniqueConfigId(getSuggestedConfigIdBase(config), existingIds);
				})()
			}
		];
	});
}

function withInsertedTentmanIdRecord(
	input: Record<string, unknown>,
	configId: string
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	let inserted = false;

	for (const [key, value] of Object.entries(input)) {
		output[key] = value;

		if (key === 'label' && !inserted) {
			output._tentmanId = configId;
			inserted = true;
		}
	}

	if (!inserted) {
		return {
			_tentmanId: configId,
			...output
		};
	}

	return output;
}

export function addContentConfigIdToSource(source: string, configId: string): string {
	const parsed = JSON.parse(source) as unknown;
	assertObject(parsed, 'content config file must be an object');

	if (parsed.type !== 'content') {
		throw new Error('Only top-level content configs can receive a Tentman id');
	}

	const nextRecord =
		typeof parsed._tentmanId === 'string' && parsed._tentmanId.length > 0
			? {
					...parsed,
					_tentmanId: configId
				}
			: withInsertedTentmanIdRecord(parsed, configId);

	return `${JSON.stringify(nextRecord, null, '\t')}\n`;
}

export async function writeMissingContentConfigIds(
	backend: RepositoryBackend,
	configs: DiscoveredConfig[],
	options?: RepositoryWriteOptions
): Promise<MissingContentConfigId[]> {
	const missingConfigs = getMissingContentConfigIds(configs);

	for (const config of missingConfigs) {
		const source = await backend.readTextFile(config.path, options);
		await backend.writeTextFile(
			config.path,
			addContentConfigIdToSource(source, config.suggestedId),
			options
		);
	}

	return missingConfigs;
}

export function addRootManualSortingToSource(source: string | null | undefined): string {
	const parsed =
		source && source.trim().length > 0 ? (JSON.parse(source) as unknown) : ({} as unknown);

	if (source && source.trim().length > 0) {
		assertObject(parsed, 'Root config must be an object');
	}

	const root = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
	const currentContent =
		root.content && typeof root.content === 'object' && !Array.isArray(root.content)
			? (root.content as Record<string, unknown>)
			: {};

	return `${JSON.stringify(
		{
			...root,
			content: {
				...currentContent,
				sorting: 'manual'
			}
		},
		null,
		2
	)}\n`;
}

export async function writeRootManualSorting(
	backend: RepositoryBackend,
	options?: RepositoryWriteOptions
): Promise<void> {
	const source = (await backend.fileExists(ROOT_CONFIG_PATH, options))
		? await backend.readTextFile(ROOT_CONFIG_PATH, options)
		: null;

	await backend.writeTextFile(ROOT_CONFIG_PATH, addRootManualSortingToSource(source), options);
}

function setCollectionGroupsInSource(source: string, groups: CollectionGroupConfig[]): string {
	const parsed = JSON.parse(source) as unknown;
	assertObject(parsed, 'content config file must be an object');

	if (parsed.type !== 'content') {
		throw new Error('Only content configs can receive collection groups');
	}

	const nextConfig = parsed as Record<string, unknown>;
	const nextCollection =
		nextConfig.collection === true
			? { groups }
			: nextConfig.collection && typeof nextConfig.collection === 'object' && !Array.isArray(nextConfig.collection)
				? {
						...(nextConfig.collection as Record<string, unknown>),
						groups
					}
				: { groups };

	return `${JSON.stringify(
		{
			...nextConfig,
			collection: nextCollection
		},
		null,
		'\t'
	)}\n`;
}

async function writeReconciledCollectionItems(
	backend: RepositoryBackend,
	config: DiscoveredConfig,
	items: ContentRecord[],
	options?: RepositoryWriteOptions
): Promise<void> {
	if (config.config.content.mode === 'file') {
		if (!config.config.content.itemsPath) {
			return;
		}

		const filePath = resolveConfigPath(config.path, config.config.content.path);
		const source = await backend.readTextFile(filePath, options);
		const parsed = JSON.parse(source) as Record<string, unknown> | unknown[];
		const nextJson =
			config.config.content.itemsPath === '$'
				? items
				: (() => {
						JSONPath({
							path: config.config.content.itemsPath,
							json: parsed,
							callback: () => items,
							wrap: false
						});

						return parsed;
					})();

		await backend.writeTextFile(
			filePath,
			toJsonFileContent(nextJson as ContentRecord | ContentRecord[], detectJsonIndent(source)),
			options
		);
		return;
	}

	const templateInfo = getTemplateInfo(config.path, config.config as never);

	for (const item of items) {
		const filename = getItemFilename(item);
		if (!filename) {
			continue;
		}

		const itemPath = buildCollectionFilePath(
			resolveConfigPath(config.path, config.config.content.path),
			filename
		);
		await backend.writeTextFile(
			itemPath,
			serializeCollectionItem(item, templateInfo.isMarkdown),
			options
		);
	}
}

function reconcileConfigIdentity(
	configs: DiscoveredConfig[],
	manifest: NavigationManifest | null | undefined
): ConfigIdentityState {
	const references = getConfigReferenceSet(manifest);
	const nextConfigs = configs.map((config) => ({
		...config,
		config: {
			...config.config
		}
	}));
	const duplicateWinners = new Map<string, number>();

	for (const [configId, entries] of groupByKey(
		nextConfigs
			.map((config, index) => ({ config, index }))
			.filter(
				({ config }) =>
					typeof config.config._tentmanId === 'string' &&
					config.config._tentmanId.length > 0 &&
					!hasGeneratedTentmanId(config.config)
			),
		({ config }) => config.config._tentmanId!
	)) {
		if (entries.length < 2) {
			continue;
		}

		const referencedEntries = entries.filter(({ config }) =>
			hasNavigationReference(references, [config.config.id, config.slug])
		);
		duplicateWinners.set(configId, (referencedEntries[0] ?? entries[0]).index);
	}

	const usedIds = new Set<string>();
	const refMap = new Map<string, string>();
	let changed = false;

	for (let index = 0; index < nextConfigs.length; index += 1) {
		const config = nextConfigs[index];
		const currentId = config.config._tentmanId;
		const keepsCurrentId =
			typeof currentId === 'string' &&
			currentId.length > 0 &&
			!hasGeneratedTentmanId(config.config) &&
			(!duplicateWinners.has(currentId) || duplicateWinners.get(currentId) === index) &&
			!usedIds.has(currentId);
		const referencedLegacyId = uniqueStrings([config.config.id, config.slug]).find(
			(candidate) => references.has(candidate) && !usedIds.has(candidate)
		);
		const nextId = keepsCurrentId
			? currentId
			: getUniqueConfigId(
					referencedLegacyId ?? getSuggestedConfigIdBase(config),
					usedIds
				);

		if (config.config._tentmanId !== nextId) {
			config.config._tentmanId = nextId;
			changed = true;
		}

		for (const candidate of getConfigReferenceCandidates(config)) {
			setRefMapValue(refMap, candidate, nextId);
		}
	}

	return {
		configs: nextConfigs,
		refMap,
		changed
	};
}

function reconcileGroupIdentity(
	config: DiscoveredConfig,
	manifestCollection: NavigationManifestCollection | null
): GroupIdentityState {
	const configGroups = getCollectionGroups(config.config);
	const manifestGroups = manifestCollection?.groups ?? [];
	const references = new Set(manifestGroups.map((group) => group.id));
	const duplicateWinners = new Map<string, number>();

	for (const [groupId, entries] of groupByKey(
		configGroups.map((group, index) => ({ group, index })),
		({ group }) => group._tentmanId ?? ''
	)) {
		if (!groupId || entries.length < 2) {
			continue;
		}

		const referencedEntries = entries.filter(({ group }) =>
			hasNavigationReference(references, [group.slug])
		);
		duplicateWinners.set(groupId, (referencedEntries[0] ?? entries[0]).index);
	}

	const usedIds = new Set<string>();
	const refMap = new Map<string, string>();
	const groups: CollectionGroupConfig[] = [];
	let changed = false;

	for (let index = 0; index < configGroups.length; index += 1) {
		const group = configGroups[index];
		const currentId = group._tentmanId;
		const keepsCurrentId =
			typeof currentId === 'string' &&
			currentId.length > 0 &&
			!hasGeneratedTentmanId(group) &&
			(!duplicateWinners.has(currentId) || duplicateWinners.get(currentId) === index) &&
			!usedIds.has(currentId);
		const nextId = keepsCurrentId
			? getUniqueIdFromBase(currentId, usedIds)
			: getUniqueIdFromBase(group.slug ?? group.label.toLowerCase().replace(/\s+/g, '-'), usedIds);
		const nextGroup: CollectionGroupConfig =
			group._tentmanId === nextId
				? group
				: {
						...group,
						_tentmanId: nextId
					};

		if (nextGroup !== group) {
			changed = true;
		}

		groups.push(nextGroup);
		for (const candidate of getGroupReferenceCandidates(group)) {
			setRefMapValue(refMap, candidate, nextId);
		}
	}

	for (const manifestGroup of manifestGroups) {
		if (refMap.has(manifestGroup.id)) {
			continue;
		}

		const nextId = getUniqueIdFromBase(
			manifestGroup.id || manifestGroup.slug || 'group',
			usedIds
		);
		const nextGroup: CollectionGroupConfig = {
			_tentmanId: nextId,
			label: manifestGroup.label ?? manifestGroup.id,
			...(manifestGroup.slug ? { slug: manifestGroup.slug } : { slug: manifestGroup.id })
		};
		groups.push(nextGroup);
		setRefMapValue(refMap, manifestGroup.id, nextId);
		if (manifestGroup.slug) {
			setRefMapValue(refMap, manifestGroup.slug, nextId);
		}
		changed = true;
	}

	return {
		groups,
		refMap,
		changed
	};
}

function reconcileItemIdentity(
	config: DiscoveredConfig,
	items: ContentRecord[],
	manifestCollection: NavigationManifestCollection | null
): ItemIdentityState {
	const references = getCollectionReferenceSet(manifestCollection);
	const duplicateWinners = new Map<string, number>();

	for (const [itemId, entries] of groupByKey(
		items
			.map((item, index) => ({ item, index }))
			.filter(
				({ item }) =>
					typeof item._tentmanId === 'string' &&
					item._tentmanId.length > 0 &&
					!hasGeneratedTentmanId(item)
			),
		({ item }) => item._tentmanId!
	)) {
		if (!itemId || entries.length < 2) {
			continue;
		}

		const referencedEntries = entries.filter(({ item }) =>
			hasNavigationReference(
				references,
				getItemReferenceCandidates(config, item).filter((candidate) => candidate !== itemId)
			)
		);
		duplicateWinners.set(itemId, (referencedEntries[0] ?? entries[0]).index);
	}

	const usedIds = new Set<string>();
	const refMap = new Map<string, string>();
	let changed = false;
	const nextItems = items.map((item, index) => {
		const currentId = item._tentmanId;
		const keepsCurrentId =
			typeof currentId === 'string' &&
			currentId.length > 0 &&
			!hasGeneratedTentmanId(item) &&
			(!duplicateWinners.has(currentId) || duplicateWinners.get(currentId) === index) &&
			!usedIds.has(currentId);
		const referencedLegacyId = getItemReferenceCandidates(config, item).find(
			(candidate) =>
				candidate !== currentId && references.has(candidate) && !usedIds.has(candidate)
		);
		const nextId = keepsCurrentId
			? getUniqueIdFromBase(currentId, usedIds)
			: getUniqueIdFromBase(referencedLegacyId ?? getUniqueItemIdBase(config, item, index), usedIds);
			const nextItem =
				item._tentmanId === nextId && !hasGeneratedTentmanId(item)
					? item
					: {
							...item,
						_tentmanId: nextId
					};

		if (nextItem !== item) {
			changed = true;
		}

		for (const candidate of getItemReferenceCandidates(config, item)) {
			setRefMapValue(refMap, candidate, nextId);
		}

		return nextItem;
	});

	return {
		items: nextItems,
		refMap,
		changed
	};
}

function getCollectionItemIds(config: DiscoveredConfig, content: unknown): string[] {
	if (!Array.isArray(content)) {
		return [];
	}

	return content.flatMap((item) => {
		const itemRecord = item as ContentRecord;
		const itemId = getItemId(itemRecord) ?? getItemRoute(config.config, itemRecord);
		return itemId ? [itemId] : [];
	});
}

export async function buildNavigationManifestFromRepository(
	backend: RepositoryBackend,
	configs: DiscoveredConfig[],
	rootConfig?: RootConfig | null,
	existingManifest?: NavigationManifest | null
): Promise<NavigationManifest> {
	const configIdentity = reconcileConfigIdentity(configs, existingManifest);
	const manifest: NavigationManifest = {
		version: 1,
		...(rootConfig?.content?.sorting === 'manual'
			? {
					content: {
						items: appendRemainingIds(
							orderByManifestReferences(
								existingManifest?.content?.items ?? [],
								configIdentity.refMap
							),
							configIdentity.configs.flatMap((config) =>
								config.config._tentmanId ? [config.config._tentmanId] : []
							)
						)
					}
				}
			: {})
	};

	const collectionEntries = await Promise.all(
		configIdentity.configs.map(async (config) => {
			if (!isCollectionManualSortingEnabled(config.config) || !config.config._tentmanId) {
				return null;
			}

			const content = await fetchContentDocument(backend, config.config, config.path);
			const manifestCollection = cloneManifestCollection(
				getConfigManifestCollection(existingManifest, config, configIdentity.refMap)
			);
			const itemIdentity = reconcileItemIdentity(
				config,
				Array.isArray(content) ? content : [],
				manifestCollection
			);
			const groupIdentity = reconcileGroupIdentity(config, manifestCollection);
			const orderedItemIds = appendRemainingIds(
				orderByManifestReferences(manifestCollection?.items ?? [], itemIdentity.refMap),
				itemIdentity.items.flatMap((item) => {
					const itemId = getItemId(item);
					return itemId ? [itemId] : [];
				})
			);
			return [
				config.config._tentmanId,
				{
					items: orderedItemIds,
					...(groupIdentity.groups.length > 0
						? {
								groups: groupIdentity.groups.flatMap((group) =>
									group._tentmanId
										? [
												{
													id: group._tentmanId,
													label: group.label,
													...(group.slug ? { slug: group.slug } : {}),
													items: orderByManifestReferences(
														(manifestCollection?.groups ?? [])
															.filter(
																(manifestGroup) =>
																	(groupIdentity.refMap.get(manifestGroup.id) ??
																		manifestGroup.id) === group._tentmanId
															)
															.flatMap((manifestGroup) => manifestGroup.items),
														itemIdentity.refMap
													)
												}
											]
										: []
								)
							}
						: {})
				}
			] satisfies [string, NavigationManifestCollection];
		})
	);

	const collections = Object.fromEntries(
		collectionEntries.flatMap((entry) => (entry ? [entry] : []))
	) as Record<string, NavigationManifestCollection>;

	if (Object.keys(collections).length > 0) {
		manifest.collections = collections;
	}

	return manifest;
}

export async function reconcileManualNavigationSetup(
	backend: RepositoryBackend,
	configs: DiscoveredConfig[],
	rootConfig: RootConfig | null | undefined,
	existingManifest: NavigationManifest | null | undefined,
	options?: RepositoryWriteOptions
): Promise<NavigationManifest> {
	const configIdentity = reconcileConfigIdentity(configs, existingManifest);

	for (let index = 0; index < configs.length; index += 1) {
		const previousConfig = configs[index];
		const nextConfig = configIdentity.configs[index];

		if (previousConfig.config._tentmanId === nextConfig.config._tentmanId) {
			continue;
		}

		const source = await backend.readTextFile(previousConfig.path, options);
		await backend.writeTextFile(
			previousConfig.path,
			addContentConfigIdToSource(source, nextConfig.config._tentmanId!),
			options
		);
	}

	for (const config of configIdentity.configs) {
		if (!isCollectionManualSortingEnabled(config.config) || !config.config._tentmanId) {
			continue;
		}

		const manifestCollection = cloneManifestCollection(
			getConfigManifestCollection(existingManifest, config, configIdentity.refMap)
		);
		const groupIdentity = reconcileGroupIdentity(config, manifestCollection);

		if (groupIdentity.changed) {
			const source = await backend.readTextFile(config.path, options);
			await backend.writeTextFile(
				config.path,
				setCollectionGroupsInSource(source, groupIdentity.groups),
				options
			);
			config.config.collection =
				config.config.collection === true
					? { groups: groupIdentity.groups }
					: {
							...(config.config.collection ?? {}),
							groups: groupIdentity.groups
						};
		}

		const content = await fetchContentDocument(backend, config.config, config.path);
		if (!Array.isArray(content)) {
			continue;
		}

		const itemIdentity = reconcileItemIdentity(config, content, manifestCollection);
		if (!itemIdentity.changed) {
			continue;
		}

		await writeReconciledCollectionItems(backend, config, itemIdentity.items, options);
	}

	return buildNavigationManifestFromRepository(
		backend,
		configIdentity.configs,
		rootConfig,
		existingManifest ?? null
	);
}

export async function writeNavigationManifest(
	backend: RepositoryBackend,
	manifest: NavigationManifest,
	options?: RepositoryWriteOptions
): Promise<void> {
	await backend.writeTextFile(
		NAVIGATION_MANIFEST_PATH,
		serializeNavigationManifest(manifest),
		options
	);
}

export function getManualNavigationSetupState(
	configs: DiscoveredConfig[],
	manifestState: NavigationManifestState,
	rootConfig?: RootConfig | null
): ManualNavigationSetupState {
	const missingConfigIds = getMissingContentConfigIds(configs);
	const collections = configs
		.filter((config) => config.config.collection)
		.map((config) => ({
			slug: config.slug,
			label: config.config.label,
			configId: config.config._tentmanId ?? null,
			idField: config.config.idField ?? null,
			manualSortingEnabled: isCollectionManualSortingEnabled(config.config),
			canOrderItems: !!config.config._tentmanId && isCollectionManualSortingEnabled(config.config),
			groupCount: getCollectionGroups(config.config).length
		}));

	const topLevelManualSortingEnabled = rootConfig?.content?.sorting === 'manual';
	const hasConfiguredManualFeatures =
		topLevelManualSortingEnabled || collections.some((collection) => collection.manualSortingEnabled);
	const hasAnyConfigId = configs.some((config) => !!config.config._tentmanId);

	let status: ManualNavigationSetupState['status'] = 'inactive';

	if (hasConfiguredManualFeatures && manifestState.exists && manifestState.manifest && missingConfigIds.length === 0) {
		status = 'active';
	} else if (
		hasConfiguredManualFeatures ||
		manifestState.exists ||
		hasAnyConfigId ||
		missingConfigIds.length < configs.length
	) {
		status = 'partial';
	}

	return {
		status,
		manifestPath: manifestState.path,
		manifestExists: manifestState.exists,
		manifestValid: manifestState.manifest !== null,
		manifestError: manifestState.error,
		topLevelManualSortingEnabled,
		missingConfigIds,
		collections
	};
}
