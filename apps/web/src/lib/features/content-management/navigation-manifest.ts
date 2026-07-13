import { JSONPath } from 'jsonpath-plus';
import {
	getNavigationReferenceId,
	getNavigationReferenceIds,
	NAVIGATION_MANIFEST_PATH,
	normalizeNavigationReference,
	parseNavigationManifest,
	serializeNavigationManifest
} from '@tentman/core/navigation-manifest';
import type {
	NavigationManifest as CoreNavigationManifest,
	NavigationManifestCollection as CoreNavigationManifestCollection,
	NavigationManifestCollectionInput as CoreNavigationManifestCollectionInput,
	NavigationManifestGroup as CoreNavigationManifestGroup,
	NavigationManifestGroupInput as CoreNavigationManifestGroupInput,
	NavigationManifestInput as CoreNavigationManifestInput,
	NavigationReference,
	NavigationReferenceInput
} from '@tentman/core/navigation-manifest';
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
import { isTentmanGroupBlock, TENTMAN_GROUP_STORAGE_KEY } from '$lib/config/tentman-group';
import {
	getCollectionGroups,
	isCollectionGroupManagementEnabled,
	isCollectionManifestBacked,
	isCollectionOrderingEnabled
} from './config';
import { getItemFilename, getItemId, getItemRoute, getItemSlug } from './item';
import { createTentmanId, hasGeneratedTentmanId } from './stable-identity';
import type { ContentRecord } from './types';
import type { BlockUsage, ContentConfig } from '$lib/config/types';
import type { RootConfig } from '$lib/config/root-config';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

export { NAVIGATION_MANIFEST_PATH, parseNavigationManifest, serializeNavigationManifest };

const ROOT_CONFIG_PATH = 'tentman.json';
const NAVIGATION_MANIFEST_CACHE_TTL = 60 * 1000;

export type NavigationManifestGroup = CoreNavigationManifestGroup;
export type NavigationManifestCollection = CoreNavigationManifestCollection;
export type NavigationManifest = CoreNavigationManifest;
export type NavigationManifestInput = CoreNavigationManifestInput;
export type NavigationManifestGroupInput = CoreNavigationManifestGroupInput;
export type NavigationManifestCollectionInput = CoreNavigationManifestCollectionInput;

export interface CollectionOrderDraftGroup {
	id: string;
	label?: string;
	items: string[];
}

export interface CollectionOrderDraft {
	ungroupedItems: string[];
	groups: CollectionOrderDraftGroup[];
}

export type CollectionGroupManagementMutation =
	| { action: 'create'; label: string; value: string; id?: string }
	| { action: 'edit'; groupId: string; label: string; value: string }
	| { action: 'delete'; groupId: string }
	| { action: 'merge'; sourceGroupId: string; targetGroupId: string };

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
	groupManagementEnabled: boolean;
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

interface CachedNavigationManifestStateEntry {
	value: NavigationManifestState;
	timestamp: number;
}

const navigationManifestCache = new Map<string, CachedNavigationManifestStateEntry>();
const navigationManifestInflight = new Map<string, Promise<NavigationManifestState>>();

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}
}

function readOptionalString(value: unknown, context: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${context} must be a non-empty string when present`);
	}

	return value;
}

function getNavigationIds(references: NavigationReferenceInput[] | null | undefined): string[] {
	return getNavigationReferenceIds(references);
}

function toNavigationReferences(ids: string[]): NavigationReference[] {
	return ids.map((id) => ({ id }));
}

function cloneNavigationReferences(
	references: NavigationReferenceInput[] | null | undefined
): NavigationReference[] {
	return (references ?? []).map((reference) => normalizeNavigationReference(reference));
}

function getGroupNavigationReferences(groups: NavigationManifestGroup[]): NavigationReference[] {
	return cloneNavigationReferences(groups.flatMap((group) => group.items ?? []));
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
		(candidate) =>
			typeof candidate === 'string' && candidate.length > 0 && references.has(candidate)
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
	return uniqueStrings([group._tentmanId, group.value]);
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
		...getNavigationIds(manifest?.content?.items),
		...Object.keys(manifest?.collections ?? {})
	]);
}

function getCollectionReferenceSet(collection: NavigationManifestCollection | null): Set<string> {
	return new Set([
		...getNavigationIds(collection?.items),
		...(collection?.groups?.flatMap((group) => getNavigationIds(group.items)) ?? [])
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
		...(collection.id ? { id: collection.id } : {}),
		...(collection.label ? { label: collection.label } : {}),
		...(collection.slug ? { slug: collection.slug } : {}),
		...(collection.href ? { href: collection.href } : {}),
		...(collection.configId ? { configId: collection.configId } : {}),
		items: cloneNavigationReferences(collection.items),
		...(collection.groups
			? {
					groups: collection.groups.map((group) => ({
						id: group.id,
						...(group.label ? { label: group.label } : {}),
						...(group.value ? { value: group.value } : {}),
						...(group.href ? { href: group.href } : {}),
						items: cloneNavigationReferences(group.items)
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

function isServerRuntime(): boolean {
	return typeof window === 'undefined';
}

function getNavigationManifestCacheKey(
	backend: RepositoryBackend,
	options?: RepositoryReadOptions
): string {
	return `${backend.cacheKey}:navigation-manifest:${options?.ref ?? ''}`;
}

function isFreshNavigationManifestState(
	entry: CachedNavigationManifestStateEntry | undefined
): entry is CachedNavigationManifestStateEntry {
	return entry !== undefined && Date.now() - entry.timestamp < NAVIGATION_MANIFEST_CACHE_TTL;
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	if ('status' in error && error.status === 404) {
		return true;
	}

	return 'name' in error && error.name === 'NotFoundError';
}

async function readNavigationManifestState(
	backend: RepositoryBackend,
	options?: RepositoryReadOptions
): Promise<NavigationManifestState> {
	let content: string;

	try {
		content = await backend.readTextFile(NAVIGATION_MANIFEST_PATH, options);
	} catch (error) {
		if (isNotFoundError(error)) {
			return {
				path: NAVIGATION_MANIFEST_PATH,
				exists: false,
				manifest: null,
				error: null
			};
		}

		throw error;
	}

	try {
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

export function invalidateNavigationManifestStateCache(
	backend: RepositoryBackend,
	options?: RepositoryReadOptions
): void {
	const cacheKey = getNavigationManifestCacheKey(backend, options);
	navigationManifestCache.delete(cacheKey);
	navigationManifestInflight.delete(cacheKey);
}

export function clearNavigationManifestStateCache(): void {
	navigationManifestCache.clear();
	navigationManifestInflight.clear();
}

export async function loadNavigationManifestState(
	backend: RepositoryBackend,
	options?: RepositoryReadOptions
): Promise<NavigationManifestState> {
	if (!isServerRuntime()) {
		return readNavigationManifestState(backend, options);
	}

	const cacheKey = getNavigationManifestCacheKey(backend, options);
	const cachedEntry = navigationManifestCache.get(cacheKey);
	if (isFreshNavigationManifestState(cachedEntry)) {
		return cachedEntry.value;
	}

	const pending = navigationManifestInflight.get(cacheKey);
	if (pending) {
		return pending;
	}

	const fetchPromise = readNavigationManifestState(backend, options)
		.then((value) => {
			navigationManifestCache.set(cacheKey, {
				value,
				timestamp: Date.now()
			});
			return value;
		})
		.finally(() => {
			navigationManifestInflight.delete(cacheKey);
		});

	navigationManifestInflight.set(cacheKey, fetchPromise);
	return fetchPromise;
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
					if (typeof config.config._tentmanId === 'string' && config.config._tentmanId.length > 0) {
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
			: nextConfig.collection &&
				  typeof nextConfig.collection === 'object' &&
				  !Array.isArray(nextConfig.collection)
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

function getCollectionGroupFieldIds(blocks: BlockUsage[], collectionIds: Set<string>): string[] {
	const matches: string[] = [];

	for (const block of blocks) {
		if (block.type === 'block') {
			matches.push(...getCollectionGroupFieldIds(block.blocks ?? [], collectionIds));
			continue;
		}

		if (isTentmanGroupBlock(block) && collectionIds.has(block.collection)) {
			matches.push(TENTMAN_GROUP_STORAGE_KEY);
		}
	}

	return matches;
}

export function detectCollectionGroupField(config: DiscoveredConfig): string {
	const collectionIds = new Set(
		[config.slug, config.config._tentmanId, config.config.id].filter(
			(value): value is string => typeof value === 'string' && value.length > 0
		)
	);
	const matches = getCollectionGroupFieldIds(config.config.blocks, collectionIds);

	if (matches.length === 1) {
		return matches[0]!;
	}

	if (matches.length === 0) {
		throw new Error(
			`Cannot move ${config.config.label} items between groups because no tentmanGroup block targets this collection.`
		);
	}

	throw new Error(
		`Cannot move ${config.config.label} items between groups because multiple tentmanGroup blocks target this collection.`
	);
}

function getDraftItemGroupMap(collection: CollectionOrderDraft): Map<string, string | null> {
	const itemGroups = new Map<string, string | null>();

	for (const group of collection.groups) {
		for (const itemId of group.items) {
			itemGroups.set(itemId, group.id);
		}
	}

	for (const itemId of collection.ungroupedItems) {
		itemGroups.set(itemId, null);
	}

	return itemGroups;
}

function getCurrentItemGroupMap(
	items: ContentRecord[],
	groupFieldId: string | null
): Map<string, string | null> {
	const itemGroups = new Map<string, string | null>();

	for (const item of items) {
		const itemId = getItemId(item);
		if (!itemId) {
			continue;
		}

		const groupValue = groupFieldId ? item[groupFieldId] : undefined;
		itemGroups.set(
			itemId,
			typeof groupValue === 'string' && groupValue.length > 0 ? groupValue : null
		);
	}

	return itemGroups;
}

function getManifestItemGroupMap(
	manifest: NavigationManifest | null | undefined,
	config: DiscoveredConfig
): Map<string, string | null> {
	const map = new Map<string, string | null>();
	const collection = config.config._tentmanId
		? (manifest?.collections?.[config.config._tentmanId] ?? null)
		: null;

	for (const group of collection?.groups ?? []) {
		for (const itemId of getNavigationIds(group.items)) {
			map.set(itemId, group.id);
		}
	}

	for (const itemId of getNavigationIds(collection?.items)) {
		if (!map.has(itemId)) {
			map.set(itemId, null);
		}
	}

	return map;
}

function hasItemGroupChanges(
	nextGroups: Map<string, string | null>,
	currentGroups: Map<string, string | null>
): boolean {
	for (const [itemId, groupId] of nextGroups) {
		if ((currentGroups.get(itemId) ?? null) !== groupId) {
			return true;
		}
	}

	return false;
}

function applyItemGroups(
	items: ContentRecord[],
	groupFieldId: string,
	nextGroups: Map<string, string | null>
): ContentRecord[] {
	return items.map((item) => {
		const itemId = getItemId(item);
		if (!itemId || !nextGroups.has(itemId)) {
			return item;
		}

		const groupId = nextGroups.get(itemId);
		if (groupId) {
			return {
				...item,
				[groupFieldId]: groupId
			};
		}

		const { [groupFieldId]: _removed, ...rest } = item;
		return rest;
	});
}

function orderCollectionGroups(
	config: ContentConfig,
	collection: CollectionOrderDraft
): CollectionGroupConfig[] {
	const groupsById = new Map(
		getCollectionGroups(config).flatMap((group) =>
			group._tentmanId ? [[group._tentmanId, group] as const] : []
		)
	);
	const orderedGroups: CollectionGroupConfig[] = [];
	const seenIds = new Set<string>();

	for (const draftGroup of collection.groups) {
		const group = groupsById.get(draftGroup.id);
		if (!group || seenIds.has(draftGroup.id)) {
			continue;
		}

		orderedGroups.push(group);
		seenIds.add(draftGroup.id);
	}

	for (const group of getCollectionGroups(config)) {
		if (!group._tentmanId || seenIds.has(group._tentmanId)) {
			continue;
		}

		orderedGroups.push(group);
	}

	return orderedGroups;
}

function toManifestGroups(
	groups: CollectionGroupConfig[],
	collection: CollectionOrderDraft
): NavigationManifestGroup[] {
	const draftGroups = new Map(collection.groups.map((group) => [group.id, group]));

	return groups.flatMap((group) => {
		if (!group._tentmanId) {
			return [];
		}

		return [
			{
				id: group._tentmanId,
				label: group.label,
				...(group.value ? { value: group.value } : {}),
				items: toNavigationReferences(draftGroups.get(group._tentmanId)?.items ?? [])
			}
		];
	});
}

function setManifestCollectionOrder(
	manifest: NavigationManifest | null | undefined,
	configId: string,
	groups: NavigationManifestGroup[],
	ungroupedItems: string[]
): NavigationManifest {
	const nextManifest: NavigationManifest = {
		version: 1,
		...(manifest?.content ? { content: { items: [...(manifest.content.items ?? [])] } } : {}),
		...(manifest?.collections
			? {
					collections: Object.fromEntries(
						Object.entries(manifest.collections).map(([id, collection]) => [
							id,
							cloneManifestCollection(collection)!
						])
					)
				}
			: {})
	};

	nextManifest.collections = {
		...(nextManifest.collections ?? {}),
		[configId]: {
			...(nextManifest.collections?.[configId] ?? {}),
			items: [
				...groups.flatMap((group) => group.items ?? []),
				...toNavigationReferences(ungroupedItems)
			],
			...(groups.length > 0 ? { groups } : {})
		}
	};

	return nextManifest;
}

function areNavigationManifestsEqual(
	left: NavigationManifest | null | undefined,
	right: NavigationManifest | null | undefined
): boolean {
	if (!left || !right) {
		return left === right;
	}

	return serializeNavigationManifest(left) === serializeNavigationManifest(right);
}

function getExistingGroupValues(
	groups: CollectionGroupConfig[],
	ignoredGroupId?: string
): Set<string> {
	return new Set(
		groups.flatMap((group) =>
			group._tentmanId !== ignoredGroupId && group.value ? [group.value] : []
		)
	);
}

function validateCollectionGroupFields(input: { label: string; value: string }): {
	label: string;
	value: string;
} {
	const label = input.label.trim();
	const value = input.value.trim();

	if (!label) {
		throw new Error('Group label is required');
	}

	if (!value) {
		throw new Error('Group value is required');
	}

	return { label, value };
}

function assertGroupManagementEnabled(config: DiscoveredConfig): void {
	if (!config.config._tentmanId) {
		throw new Error(
			`${config.config.label} needs a Tentman-managed id before its groups can be managed.`
		);
	}

	if (!isCollectionGroupManagementEnabled(config.config)) {
		throw new Error(`${config.config.label} does not have collection group management enabled.`);
	}
}

function getGroupById(groups: CollectionGroupConfig[], groupId: string): CollectionGroupConfig {
	const group = groups.find((candidate) => candidate._tentmanId === groupId);
	if (!group) {
		throw new Error(`Unknown collection group: ${groupId}`);
	}

	return group;
}

function createManifestCollectionFromItems(
	config: DiscoveredConfig,
	items: ContentRecord[],
	manifestCollection: NavigationManifestCollection | null | undefined,
	groups: CollectionGroupConfig[]
): NavigationManifestCollection {
	const itemIds = items.flatMap((item) => {
		const itemId = getItemId(item);
		return itemId ? [itemId] : [];
	});
	const orderedItems = appendRemainingIds(getNavigationIds(manifestCollection?.items), itemIds);
	const itemGroups = getCurrentItemGroupMap(items, TENTMAN_GROUP_STORAGE_KEY);
	const manifestGroups = groups.flatMap((group) => {
		if (!group._tentmanId) {
			return [];
		}

		const existingGroup = manifestCollection?.groups?.find(
			(candidate) => candidate.id === group._tentmanId
		);
		const existingItems = existingGroup
			? cloneNavigationReferences(existingGroup.items).filter((reference) =>
					orderedItems.includes(reference.id)
				)
			: toNavigationReferences(
					orderedItems.filter((itemId) => itemGroups.get(itemId) === group._tentmanId)
				);

		return [
			{
				id: group._tentmanId,
				label: group.label,
				...(group.value ? { value: group.value } : {}),
				items: existingItems
			}
		];
	});

	return {
		...(manifestCollection ? cloneManifestCollection(manifestCollection) : {}),
		id: config.config._tentmanId!,
		label: config.config.label,
		slug: config.slug,
		...(config.config.id ? { configId: config.config.id } : {}),
		items: toNavigationReferences(orderedItems),
		...(manifestGroups.length > 0 ? { groups: manifestGroups } : {})
	};
}

function setManifestCollection(
	manifest: NavigationManifest | null | undefined,
	configId: string,
	collection: NavigationManifestCollection
): NavigationManifest {
	const nextManifest: NavigationManifest = {
		version: 1,
		...(manifest?.content ? { content: { items: [...(manifest.content.items ?? [])] } } : {}),
		...(manifest?.collections
			? {
					collections: Object.fromEntries(
						Object.entries(manifest.collections).map(([id, currentCollection]) => [
							id,
							cloneManifestCollection(currentCollection)!
						])
					)
				}
			: {})
	};

	nextManifest.collections = {
		...(nextManifest.collections ?? {}),
		[configId]: collection
	};

	return nextManifest;
}

function getUngroupedManifestItems(collection: NavigationManifestCollection): string[] {
	const groupedItems = new Set(
		collection.groups?.flatMap((group) => getNavigationIds(group.items)) ?? []
	);
	return getNavigationIds(collection.items).filter((itemId) => !groupedItems.has(itemId));
}

function applyCollectionGroupMutationToConfig(
	groups: CollectionGroupConfig[],
	mutation: CollectionGroupManagementMutation
): CollectionGroupConfig[] {
	if (mutation.action === 'create') {
		const id = mutation.id?.trim() || createTentmanId();
		const fields = validateCollectionGroupFields(mutation);

		if (groups.some((group) => group._tentmanId === id)) {
			throw new Error(`A group with id "${id}" already exists`);
		}

		if (getExistingGroupValues(groups).has(fields.value)) {
			throw new Error(`A group with value "${fields.value}" already exists`);
		}

		return [
			...groups,
			{
				_tentmanId: id,
				label: fields.label,
				value: fields.value
			}
		];
	}

	if (mutation.action === 'edit') {
		const fields = validateCollectionGroupFields(mutation);
		getGroupById(groups, mutation.groupId);

		if (getExistingGroupValues(groups, mutation.groupId).has(fields.value)) {
			throw new Error(`A group with value "${fields.value}" already exists`);
		}

		return groups.map((group) =>
			group._tentmanId === mutation.groupId
				? {
						...group,
						label: fields.label,
						value: fields.value
					}
				: group
		);
	}

	if (mutation.action === 'delete') {
		getGroupById(groups, mutation.groupId);
		return groups.filter((group) => group._tentmanId !== mutation.groupId);
	}

	getGroupById(groups, mutation.sourceGroupId);
	getGroupById(groups, mutation.targetGroupId);
	return groups.filter((group) => group._tentmanId !== mutation.sourceGroupId);
}

function applyCollectionGroupMutationToManifest(
	collection: NavigationManifestCollection,
	groups: CollectionGroupConfig[],
	mutation: CollectionGroupManagementMutation
): NavigationManifestCollection {
	if (mutation.action === 'delete') {
		const deletedGroup = collection.groups?.find((group) => group.id === mutation.groupId);
		const nextGroups = (collection.groups ?? []).filter((group) => group.id !== mutation.groupId);
		const ungroupedItems = [
			...getUngroupedManifestItems(collection),
			...getNavigationIds(deletedGroup?.items)
		];
		return {
			...collection,
			items: [
				...getGroupNavigationReferences(nextGroups),
				...toNavigationReferences(ungroupedItems)
			],
			...(nextGroups.length > 0 ? { groups: nextGroups } : { groups: undefined })
		};
	}

	if (mutation.action === 'merge') {
		if (mutation.sourceGroupId === mutation.targetGroupId) {
			throw new Error('Source and target groups must be different');
		}

		const sourceGroup = collection.groups?.find((group) => group.id === mutation.sourceGroupId);
		const targetGroup = collection.groups?.find((group) => group.id === mutation.targetGroupId);
		if (!sourceGroup || !targetGroup) {
			throw new Error('Unknown collection group');
		}

		const nextGroups = (collection.groups ?? [])
			.filter((group) => group.id !== mutation.sourceGroupId)
			.map((group) =>
				group.id === mutation.targetGroupId
					? {
							...group,
							items: cloneNavigationReferences([
								...(group.items ?? []),
								...(sourceGroup.items ?? [])
							])
						}
					: group
			);
		const ungroupedItems = getUngroupedManifestItems(collection);

		return {
			...collection,
			items: [
				...getGroupNavigationReferences(nextGroups),
				...toNavigationReferences(ungroupedItems)
			],
			...(nextGroups.length > 0 ? { groups: nextGroups } : { groups: undefined })
		};
	}

	const groupsById = new Map(
		groups.flatMap((group) => (group._tentmanId ? [[group._tentmanId, group]] : []))
	);
	const existingGroupsById = new Map((collection.groups ?? []).map((group) => [group.id, group]));
	const nextGroups = groups.flatMap((group) => {
		if (!group._tentmanId) {
			return [];
		}

		const existingGroup = existingGroupsById.get(group._tentmanId);
		return [
			{
				id: group._tentmanId,
				label: group.label,
				...(group.value ? { value: group.value } : {}),
				items: cloneNavigationReferences(existingGroup?.items)
			}
		];
	});
	const knownGroupIds = new Set(groupsById.keys());
	const groupedItems = new Set(nextGroups.flatMap((group) => getNavigationIds(group.items)));
	const ungroupedItems = getNavigationIds(collection.items).filter(
		(itemId) => !groupedItems.has(itemId)
	);

	return {
		...collection,
		items: [...getGroupNavigationReferences(nextGroups), ...toNavigationReferences(ungroupedItems)],
		...(nextGroups.length > 0
			? { groups: nextGroups.filter((group) => knownGroupIds.has(group.id)) }
			: {})
	};
}

function applyCollectionGroupMutationToItems(
	items: ContentRecord[],
	mutation: CollectionGroupManagementMutation
): ContentRecord[] {
	if (mutation.action === 'delete') {
		return items.map((item) =>
			item[TENTMAN_GROUP_STORAGE_KEY] === mutation.groupId
				? (() => {
						const { [TENTMAN_GROUP_STORAGE_KEY]: _removed, ...rest } = item;
						return rest;
					})()
				: item
		);
	}

	if (mutation.action === 'merge') {
		return items.map((item) =>
			item[TENTMAN_GROUP_STORAGE_KEY] === mutation.sourceGroupId
				? {
						...item,
						[TENTMAN_GROUP_STORAGE_KEY]: mutation.targetGroupId
					}
				: item
		);
	}

	return items;
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
			: getUniqueConfigId(referencedLegacyId ?? getSuggestedConfigIdBase(config), usedIds);

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
			hasNavigationReference(references, [group.value])
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
			: getUniqueIdFromBase(group.value ?? group.label.toLowerCase().replace(/\s+/g, '-'), usedIds);
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

		const nextId = getUniqueIdFromBase(manifestGroup.id || manifestGroup.value || 'group', usedIds);
		const nextGroup: CollectionGroupConfig = {
			_tentmanId: nextId,
			label: manifestGroup.label ?? manifestGroup.id,
			value: manifestGroup.value ?? manifestGroup.id
		};
		groups.push(nextGroup);
		setRefMapValue(refMap, manifestGroup.id, nextId);
		if (manifestGroup.value) {
			setRefMapValue(refMap, manifestGroup.value, nextId);
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
			(candidate) => candidate !== currentId && references.has(candidate) && !usedIds.has(candidate)
		);
		const nextId = keepsCurrentId
			? getUniqueIdFromBase(currentId, usedIds)
			: getUniqueIdFromBase(
					referencedLegacyId ?? getUniqueItemIdBase(config, item, index),
					usedIds
				);
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
						items: toNavigationReferences(
							appendRemainingIds(
								orderByManifestReferences(
									getNavigationIds(existingManifest?.content?.items),
									configIdentity.refMap
								),
								configIdentity.configs.flatMap((config) =>
									config.config._tentmanId ? [config.config._tentmanId] : []
								)
							)
						)
					}
				}
			: {})
	};

	const collectionEntries = await Promise.all(
		configIdentity.configs.map(async (config) => {
			if (!isCollectionManifestBacked(config.config) || !config.config._tentmanId) {
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
				orderByManifestReferences(getNavigationIds(manifestCollection?.items), itemIdentity.refMap),
				itemIdentity.items.flatMap((item) => {
					const itemId = getItemId(item);
					return itemId ? [itemId] : [];
				})
			);
			return [
				config.config._tentmanId,
				{
					id: config.config._tentmanId,
					label: config.config.label,
					slug: config.slug,
					...(config.config.id ? { configId: config.config.id } : {}),
					items: toNavigationReferences(orderedItemIds),
					...(groupIdentity.groups.length > 0
						? {
								groups: groupIdentity.groups.flatMap((group) =>
									group._tentmanId
										? [
												{
													id: group._tentmanId,
													label: group.label,
													...(group.value ? { value: group.value } : {}),
													items: toNavigationReferences(
														orderByManifestReferences(
															(manifestCollection?.groups ?? [])
																.filter(
																	(manifestGroup) =>
																		(groupIdentity.refMap.get(manifestGroup.id) ??
																			manifestGroup.id) === group._tentmanId
																)
																.flatMap((manifestGroup) => getNavigationIds(manifestGroup.items)),
															itemIdentity.refMap
														)
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
		if (!isCollectionManifestBacked(config.config) || !config.config._tentmanId) {
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

export async function saveCollectionOrder(
	backend: RepositoryBackend,
	config: DiscoveredConfig,
	collection: CollectionOrderDraft,
	existingManifest: NavigationManifest | null | undefined,
	options?: RepositoryWriteOptions
): Promise<NavigationManifest> {
	if (!config.config._tentmanId) {
		throw new Error(
			`${config.config.label} needs a Tentman-managed id before its order can be saved.`
		);
	}

	if (!isCollectionOrderingEnabled(config.config)) {
		throw new Error(`${config.config.label} does not have collection ordering enabled.`);
	}

	const content = await fetchContentDocument(backend, config.config, config.path);
	const contentItems = Array.isArray(content) ? (content as ContentRecord[]) : [];
	const nextItemGroups = getDraftItemGroupMap(collection);
	const currentManifestGroups = getManifestItemGroupMap(existingManifest, config);
	const groupFieldId = (() => {
		if (!hasItemGroupChanges(nextItemGroups, currentManifestGroups)) {
			return null;
		}

		return detectCollectionGroupField(config);
	})();
	const nextGroups = orderCollectionGroups(config.config, collection);
	const configSource = await backend.readTextFile(config.path, options);

	await backend.writeTextFile(
		config.path,
		setCollectionGroupsInSource(configSource, nextGroups),
		options
	);

	if (groupFieldId) {
		const currentGroups = getCurrentItemGroupMap(contentItems, groupFieldId);
		if (hasItemGroupChanges(nextItemGroups, currentGroups)) {
			await writeReconciledCollectionItems(
				backend,
				config,
				applyItemGroups(contentItems, groupFieldId, nextItemGroups),
				options
			);
		}
	}

	const manifest = setManifestCollectionOrder(
		existingManifest,
		config.config._tentmanId,
		toManifestGroups(nextGroups, collection),
		collection.ungroupedItems
	);
	await writeNavigationManifest(backend, manifest, options);

	return manifest;
}

export async function manageCollectionGroups(
	backend: RepositoryBackend,
	config: DiscoveredConfig,
	mutation: CollectionGroupManagementMutation,
	existingManifest: NavigationManifest | null | undefined,
	options?: RepositoryWriteOptions
): Promise<NavigationManifest> {
	assertGroupManagementEnabled(config);

	if (mutation.action === 'merge' && mutation.sourceGroupId === mutation.targetGroupId) {
		throw new Error('Source and target groups must be different');
	}

	const currentGroups = getCollectionGroups(config.config);
	const nextGroups = applyCollectionGroupMutationToConfig(currentGroups, mutation);
	const configSource = await backend.readTextFile(config.path, options);
	await backend.writeTextFile(
		config.path,
		setCollectionGroupsInSource(configSource, nextGroups),
		options
	);

	const content = await fetchContentDocument(backend, config.config, config.path);
	const contentItems = Array.isArray(content) ? (content as ContentRecord[]) : [];
	const manifestCollection = createManifestCollectionFromItems(
		config,
		contentItems,
		getConfigManifestCollection(existingManifest, config),
		currentGroups
	);
	const nextManifestCollection = applyCollectionGroupMutationToManifest(
		manifestCollection,
		nextGroups,
		mutation
	);
	const nextItems = applyCollectionGroupMutationToItems(contentItems, mutation);

	if (mutation.action === 'delete' || mutation.action === 'merge') {
		await writeReconciledCollectionItems(backend, config, nextItems, options);
	}

	const manifest = setManifestCollection(
		existingManifest,
		config.config._tentmanId!,
		nextManifestCollection
	);
	await writeNavigationManifest(backend, manifest, options);

	return manifest;
}

export function syncCollectionItemGroupSelectionInManifest(
	config: DiscoveredConfig,
	item: ContentRecord,
	existingManifest: NavigationManifest | null | undefined
): NavigationManifest | null {
	if (!config.config._tentmanId || !isCollectionManifestBacked(config.config)) {
		return existingManifest ?? null;
	}

	const itemId = getItemId(item);
	if (!itemId) {
		return existingManifest ?? null;
	}

	let groupFieldId: string;

	try {
		groupFieldId = detectCollectionGroupField(config);
	} catch {
		return existingManifest ?? null;
	}

	const groupFieldValue = item[groupFieldId];
	const selectedGroupId =
		typeof groupFieldValue === 'string' && groupFieldValue.length > 0 ? groupFieldValue : null;
	const baseManifest = existingManifest ?? null;
	const manifestCollection = cloneManifestCollection(
		getConfigManifestCollection(baseManifest, config) ?? {
			items: []
		}
	) ?? {
		items: []
	};
	const currentItems = getNavigationIds(manifestCollection.items);
	const nextItems = currentItems.includes(itemId) ? currentItems : [...currentItems, itemId];
	const nextItemGroups = getManifestItemGroupMap(baseManifest, config);
	nextItemGroups.set(itemId, selectedGroupId);
	const nextGroups = getCollectionGroups(config.config).flatMap((group) => {
		if (!group._tentmanId) {
			return [];
		}

		return [
			{
				id: group._tentmanId,
				label: group.label,
				...(group.value ? { value: group.value } : {}),
				items: toNavigationReferences(
					nextItems.filter((candidate) => nextItemGroups.get(candidate) === group._tentmanId)
				)
			}
		];
	});
	const groupedItemIds = new Set(nextGroups.flatMap((group) => getNavigationIds(group.items)));
	const manifest = setManifestCollectionOrder(
		baseManifest,
		config.config._tentmanId,
		nextGroups,
		nextItems.filter((candidate) => !groupedItemIds.has(candidate))
	);

	return manifest;
}

export async function syncCollectionItemGroupSelection(
	backend: RepositoryBackend,
	config: DiscoveredConfig,
	item: ContentRecord,
	existingManifest?: NavigationManifest | null,
	options?: RepositoryWriteOptions
): Promise<NavigationManifest | null> {
	if (!config.config._tentmanId || !isCollectionManifestBacked(config.config)) {
		return existingManifest ?? null;
	}

	const itemId = getItemId(item);
	if (!itemId) {
		return existingManifest ?? null;
	}

	try {
		detectCollectionGroupField(config);
	} catch {
		return existingManifest ?? null;
	}

	const manifestState =
		existingManifest === undefined ? await loadNavigationManifestState(backend, options) : null;
	const baseManifest = existingManifest ?? manifestState?.manifest ?? null;
	const manifest = syncCollectionItemGroupSelectionInManifest(config, item, baseManifest);

	if (areNavigationManifestsEqual(baseManifest, manifest)) {
		return baseManifest;
	}

	if (manifest) {
		await writeNavigationManifest(backend, manifest, options);
	}

	return manifest;
}

export async function writeNavigationManifest(
	backend: RepositoryBackend,
	manifest: NavigationManifestInput,
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
			manualSortingEnabled: isCollectionOrderingEnabled(config.config),
			canOrderItems: !!config.config._tentmanId && isCollectionOrderingEnabled(config.config),
			groupManagementEnabled: isCollectionGroupManagementEnabled(config.config),
			groupCount: getCollectionGroups(config.config).length
		}));

	const topLevelManualSortingEnabled = rootConfig?.content?.sorting === 'manual';
	const hasConfiguredManualFeatures =
		topLevelManualSortingEnabled ||
		collections.some(
			(collection) => collection.manualSortingEnabled || collection.groupManagementEnabled
		);
	const hasAnyConfigId = configs.some((config) => !!config.config._tentmanId);

	let status: ManualNavigationSetupState['status'] = 'inactive';

	if (
		hasConfiguredManualFeatures &&
		manifestState.exists &&
		manifestState.manifest &&
		missingConfigIds.length === 0
	) {
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
