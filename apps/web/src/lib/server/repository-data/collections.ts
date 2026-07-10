import matter from 'gray-matter';
import { JSONPath } from 'jsonpath-plus';
import type { ParsedContentConfig } from '$lib/config/parse';
import { getItemId, getItemRoute } from '$lib/features/content-management/item';
import {
	getOrderedCollectionNavigation,
	orderCollectionNavigationItems
} from '$lib/features/content-management/navigation';
import type { OrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import { resolveCollectionSortCapabilities } from '$lib/features/content-management/collection-sorts';
import { normalizeRuntimeCollectionItemIds } from '$lib/features/content-management/stable-identity';
import {
	getTemplateInfo,
	isMarkdownContentPath,
	parseCollectionItem,
	parseMarkdownContentRecord
} from '$lib/features/content-management/transforms';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import { resolveConfigPath } from '$lib/utils/validation';
import { canUseGitHubSource, clearGitHubTextBlobCache, readGitHubTextBlob } from './source';
import { getRepositorySnapshot } from './snapshot';
import type {
	CollectionIndex,
	CollectionIndexItem,
	CollectionProjectionBatchResult,
	RepositorySnapshot,
	RepositoryTreeEntry,
	ResolvedCollectionItem
} from './types';

type DirectoryBackedConfig = ParsedContentConfig & {
	content: {
		mode: 'directory';
		path: string;
		template: string;
		filename?: string;
	};
};

type FileCollectionConfig = ParsedContentConfig & {
	content: {
		mode: 'file';
		path: string;
		itemsPath: string;
	};
};
type JsonContainer = Record<string, unknown> | unknown[];

interface CollectionNavigationInput {
	backend: RepositoryBackend;
	slug: string;
	ref?: string | null;
}

interface ResolveCollectionItemInput extends CollectionNavigationInput {
	itemId: string;
}

const projectionCache = new Map<string, ContentRecord>();
const collectionIndexCache = new Map<string, CollectionIndex>();
const collectionIndexInflight = new Map<string, Promise<CollectionIndex | null>>();
const collectionNavigationCache = new Map<string, OrderedCollectionNavigation>();
const collectionNavigationInflight = new Map<string, Promise<OrderedCollectionNavigation | null>>();

function isDirectoryBackedConfig(config: ParsedContentConfig): config is DirectoryBackedConfig {
	if (!config.collection) {
		return false;
	}

	return config.content.mode === 'directory';
}

function isFileCollectionConfig(config: ParsedContentConfig): config is FileCollectionConfig {
	return (
		Boolean(config.collection) &&
		config.content.mode === 'file' &&
		typeof config.content.path === 'string' &&
		typeof config.content.itemsPath === 'string' &&
		config.content.itemsPath.length > 0
	);
}

function getFilename(path: string): string {
	return path.split('/').pop() ?? path;
}

function stripFileExtension(filename: string): string {
	return filename.replace(/\.[^/.]+$/, '');
}

function getFallbackTitleFromFilename(filename: string): string {
	return stripFileExtension(filename).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isWithinDirectory(path: string, directoryPath: string): boolean {
	return path.startsWith(`${directoryPath}/`);
}

function getCandidateItemEntries(
	snapshot: RepositorySnapshot,
	config: DirectoryBackedConfig,
	configPath: string
): RepositoryTreeEntry[] {
	const tree = snapshot.tree;
	if (!tree) {
		return [];
	}

	const info = getTemplateInfo(configPath, config);
	const directoryPath = resolveConfigPath(configPath, config.content.path);

	return tree.entries.filter((entry) => {
		if (entry.type !== 'blob') {
			return false;
		}

		if (!isWithinDirectory(entry.path, directoryPath)) {
			return false;
		}

		const filename = getFilename(entry.path);
		if (filename.startsWith('_')) {
			return false;
		}

		if (filename === info.templateFilename) {
			return false;
		}

		if (filename.endsWith('.tentman.json')) {
			return false;
		}

		return filename.endsWith(info.templateExt);
	});
}

function findBlobEntry(snapshot: RepositorySnapshot, path: string): RepositoryTreeEntry | null {
	return (
		snapshot.tree?.entries.find((entry) => entry.type === 'blob' && entry.path === path) ?? null
	);
}

function collectProjectionFieldIds(config: ParsedContentConfig): Set<string> {
	const fieldIds = new Set<string>(['_tentmanId', '_filename']);
	if (config.idField) {
		fieldIds.add(config.idField);
	}

	for (const block of config.blocks) {
		fieldIds.add(block.id);
	}

	if (
		config.collection &&
		config.collection !== true &&
		typeof config.collection === 'object' &&
		config.collection.state?.blockId
	) {
		fieldIds.add(config.collection.state.blockId);
	}

	return fieldIds;
}

function getProjectionSchemaIdentity(config: ParsedContentConfig, fieldIds: Set<string>): string {
	const collection =
		config.collection && config.collection !== true && typeof config.collection === 'object'
			? config.collection
			: null;
	return JSON.stringify({
		idField: config.idField ?? null,
		fields: [...fieldIds].sort(),
		itemLabel: config.itemLabel ?? null,
		ordering: collection?.ordering ?? null,
		defaultSort: collection?.defaultSort ?? null,
		sorts: collection?.sorts ?? null,
		groups:
			collection?.groups?.map((group) => ({
				id: group._tentmanId ?? null,
				label: group.label
			})) ?? null,
		state: collection?.state ?? null
	});
}

function pickProjectionFields(item: ContentRecord, fieldIds: Set<string>): ContentRecord {
	const projection: Record<string, ContentValue> = {};

	for (const fieldId of fieldIds) {
		const value = item[fieldId];
		if (value !== undefined) {
			projection[fieldId] = value;
		}
	}

	return projection as ContentRecord;
}

function parseMarkdownProjection(
	content: string,
	filename: string,
	fieldIds: Set<string>
): ContentRecord {
	const parsed = matter(content);
	const frontmatter =
		parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
			? ({ ...parsed.data } as ContentRecord)
			: {};
	const body = parsed.content.length > 0 ? parsed.content : frontmatter.body;
	const source: ContentRecord = {
		...frontmatter,
		...(typeof body === 'string' && fieldIds.has('body') ? { body } : {}),
		_filename: filename
	};

	return pickProjectionFields(source, fieldIds);
}

function parseProjection(
	content: string,
	filename: string,
	isMarkdown: boolean,
	fieldIds: Set<string>
): ContentRecord {
	if (isMarkdown) {
		return parseMarkdownProjection(content, filename, fieldIds);
	}

	return pickProjectionFields(parseCollectionItem(content, false, filename), fieldIds);
}

async function loadItemProjection(
	backend: Parameters<typeof readGitHubTextBlob>[0],
	entry: RepositoryTreeEntry,
	options: {
		filename: string;
		isMarkdown: boolean;
		fieldIds: Set<string>;
		repoKey: string;
		schemaIdentity: string;
	}
): Promise<ContentRecord | null> {
	const cacheKey = [
		'item-projection',
		options.repoKey,
		entry.path,
		entry.sha,
		options.schemaIdentity
	].join(':');
	const cached = projectionCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	try {
		const projection = parseProjection(
			await readGitHubTextBlob(backend, entry.sha),
			options.filename,
			options.isMarkdown,
			options.fieldIds
		);
		projectionCache.set(cacheKey, projection);
		return projection;
	} catch (err) {
		console.error(`Failed to build collection item projection for ${entry.path}:`, err);
		return null;
	}
}

function getCollectionIndexCacheKey(
	snapshot: RepositorySnapshot,
	config: DirectoryBackedConfig,
	configPath: string,
	slug: string
): string {
	const info = getTemplateInfo(configPath, config);
	const directoryPath = resolveConfigPath(configPath, config.content.path);
	const fieldIds = collectProjectionFieldIds(config);
	return [
		'collection-index',
		snapshot.identity.repoKey,
		snapshot.identity.ref,
		snapshot.identity.headSha,
		snapshot.identity.treeSha,
		slug,
		configPath,
		directoryPath,
		info.resolvedTemplatePath,
		getProjectionSchemaIdentity(config, fieldIds)
	].join(':');
}

function getCollectionNavigationCacheKey(index: CollectionIndex): string {
	return [
		'collection-navigation',
		index.identity.repoKey,
		index.identity.ref,
		index.identity.headSha,
		index.identity.treeSha,
		index.identity.configSlug,
		index.identity.configPath,
		index.identity.contentIdentity,
		index.identity.schemaIdentity
	].join(':');
}

function getFileCollectionIndexCacheKey(
	snapshot: RepositorySnapshot,
	config: FileCollectionConfig,
	configPath: string,
	slug: string,
	blobSha: string
): string {
	const contentPath = resolveConfigPath(configPath, config.content.path);
	const fieldIds = collectProjectionFieldIds(config);
	return [
		'collection-index',
		snapshot.identity.repoKey,
		snapshot.identity.ref,
		snapshot.identity.headSha,
		snapshot.identity.treeSha,
		slug,
		configPath,
		contentPath,
		blobSha,
		config.content.itemsPath,
		getProjectionSchemaIdentity(config, fieldIds)
	].join(':');
}

function getFileCollectionEntry(input: {
	snapshot: RepositorySnapshot;
	config: FileCollectionConfig;
	configPath: string;
}): RepositoryTreeEntry | null {
	const path = resolveConfigPath(input.configPath, input.config.content.path);
	return findBlobEntry(input.snapshot, path);
}

function toCollectionIndexItems(
	config: DirectoryBackedConfig,
	entries: RepositoryTreeEntry[],
	projections: ContentRecord[],
	rootConfig: RepositorySnapshot['rootConfig']
): CollectionIndexItem[] {
	const content = normalizeRuntimeCollectionItemIds(config, projections);
	const navigation = getOrderedCollectionNavigation(config, content, null, rootConfig);
	const navigationByItemId = new Map(navigation.items.map((item) => [item.itemId, item]));

	return content.flatMap((item, index) => {
		const entry = entries[index];
		if (!entry) {
			return [];
		}

		const route = getItemRoute(config, item);
		const fallbackId = getItemId(item) ?? route;
		if (!route || !fallbackId) {
			return [];
		}

		const navigationItem = navigationByItemId.get(fallbackId);
		return [
			{
				itemId: fallbackId,
				route,
				path: entry.path,
				filename: getFilename(entry.path),
				blobSha: entry.sha,
				title: navigationItem?.title ?? route,
				sortDate: navigationItem?.sortDate ?? null,
				sortValues: navigationItem?.sortValues ?? {},
				hydration: 'hydrated' as const,
				hrefItemId: route,
				...(navigationItem?.state ? { state: navigationItem.state } : {})
			}
		];
	});
}

function toDirectoryFallbackCollectionIndexItems(
	config: DirectoryBackedConfig,
	entries: RepositoryTreeEntry[]
): CollectionIndexItem[] {
	const filenameSort = resolveCollectionSortCapabilities(config).sorts.find(
		(sort) => sort.type === 'filename'
	);

	return entries.map((entry) => {
		const filename = getFilename(entry.path);
		const route = stripFileExtension(filename);

		return {
			itemId: route,
			route,
			path: entry.path,
			filename,
			blobSha: entry.sha,
			title: getFallbackTitleFromFilename(filename) || route,
			sortDate: null,
			sortValues: filenameSort ? { [filenameSort.id]: filename } : {},
			hydration: 'fallback',
			hrefItemId: route
		};
	});
}

function createCollectionIndex(
	snapshot: RepositorySnapshot,
	config: DirectoryBackedConfig,
	configPath: string,
	slug: string,
	items: CollectionIndexItem[],
	schemaIdentity: string
): CollectionIndex {
	const info = getTemplateInfo(configPath, config);
	const directoryPath = resolveConfigPath(configPath, config.content.path);
	const identity = {
		repoKey: snapshot.identity.repoKey,
		ref: snapshot.identity.ref,
		headSha: snapshot.identity.headSha,
		treeSha: snapshot.identity.treeSha,
		configSlug: slug,
		configPath,
		contentIdentity: `${directoryPath}:${info.resolvedTemplatePath}`,
		schemaIdentity
	};

	return {
		identity,
		configSlug: slug,
		mode: 'directory',
		items,
		byId: new Map(items.map((item) => [item.itemId, item])),
		byRoute: new Map(items.map((item) => [item.route, item])),
		byPath: new Map(items.map((item) => [item.path, item]))
	};
}

function createFileCollectionIndex(input: {
	snapshot: RepositorySnapshot;
	config: FileCollectionConfig;
	configPath: string;
	slug: string;
	path: string;
	blobSha: string;
	items: CollectionIndexItem[];
	schemaIdentity: string;
}): CollectionIndex {
	const identity = {
		repoKey: input.snapshot.identity.repoKey,
		ref: input.snapshot.identity.ref,
		headSha: input.snapshot.identity.headSha,
		treeSha: input.snapshot.identity.treeSha,
		configSlug: input.slug,
		configPath: input.configPath,
		contentIdentity: `${input.path}:${input.blobSha}:${input.config.content.itemsPath}`,
		schemaIdentity: input.schemaIdentity
	};

	return {
		identity,
		configSlug: input.slug,
		mode: 'file',
		items: input.items,
		byId: new Map(input.items.map((item) => [item.itemId, item])),
		byRoute: new Map(input.items.map((item) => [item.route, item])),
		byPath: new Map(input.items.map((item) => [item.path, item]))
	};
}

function parseFileCollectionItems(config: FileCollectionConfig, raw: string): ContentRecord[] {
	const container: JsonContainer = isMarkdownContentPath(config.content.path)
		? parseMarkdownContentRecord(raw)
		: (JSON.parse(raw) as JsonContainer);
	const items = JSONPath({ path: config.content.itemsPath, json: container, wrap: false });

	if (!Array.isArray(items)) {
		throw new Error('content.itemsPath did not resolve to an array');
	}

	return items as ContentRecord[];
}

function toFileCollectionIndexItems(input: {
	config: FileCollectionConfig;
	content: ContentRecord[];
	path: string;
	blobSha: string;
	rootConfig: RepositorySnapshot['rootConfig'];
}): CollectionIndexItem[] {
	const content = normalizeRuntimeCollectionItemIds(input.config, input.content);
	const navigation = getOrderedCollectionNavigation(input.config, content, null, input.rootConfig);
	const navigationByItemId = new Map(navigation.items.map((item) => [item.itemId, item]));
	const filename = getFilename(input.path);

	return content.flatMap((item, index) => {
		const route = getItemRoute(input.config, item);
		const fallbackId = getItemId(item) ?? route ?? String(index);
		if (!route && fallbackId === String(index)) {
			return [];
		}

		const normalizedItemId = getItemId(item);
		const navigationItem =
			(normalizedItemId ? navigationByItemId.get(normalizedItemId) : undefined) ??
			navigationByItemId.get(fallbackId);
		return [
			{
				itemId: fallbackId,
				route: route ?? fallbackId,
				path: input.path,
				filename,
				blobSha: input.blobSha,
				index,
				title: navigationItem?.title ?? route ?? fallbackId,
				sortDate: navigationItem?.sortDate ?? null,
				sortValues: navigationItem?.sortValues ?? {},
				hydration: 'hydrated' as const,
				hrefItemId: route ?? fallbackId,
				...(navigationItem?.state ? { state: navigationItem.state } : {})
			}
		];
	});
}

function getCollectionIndexItemFromContent(input: {
	config: ParsedContentConfig;
	content: ContentRecord;
	path: string;
	blobSha: string;
	index?: number;
}): CollectionIndexItem | null {
	const route = getItemRoute(input.config, input.content);
	const itemId = getItemId(input.content) ?? route;
	if (!itemId || !route) {
		return null;
	}

	return {
		itemId,
		route,
		path: input.path,
		filename: getFilename(input.path),
		blobSha: input.blobSha,
		...(typeof input.index === 'number' ? { index: input.index } : {}),
		title: route,
		sortDate: null,
		sortValues: {},
		hydration: 'hydrated',
		hrefItemId: route
	};
}

async function buildDirectoryCollectionIndex(
	input: CollectionNavigationInput,
	snapshot: RepositorySnapshot,
	config: DirectoryBackedConfig,
	configPath: string
): Promise<CollectionIndex | null> {
	if (!canUseGitHubSource(input.backend) || !snapshot.tree) {
		return null;
	}

	const entries = getCandidateItemEntries(snapshot, config, configPath);
	const fieldIds = collectProjectionFieldIds(config);
	const schemaIdentity = getProjectionSchemaIdentity(config, fieldIds);

	return createCollectionIndex(
		snapshot,
		config,
		configPath,
		input.slug,
		toDirectoryFallbackCollectionIndexItems(config, entries),
		schemaIdentity
	);
}

async function hydrateDirectoryCollectionEntries(input: {
	backend: Parameters<typeof readGitHubTextBlob>[0];
	snapshot: RepositorySnapshot;
	config: DirectoryBackedConfig;
	configPath: string;
	slug: string;
	blobShas: string[];
}): Promise<CollectionProjectionBatchResult | null> {
	const entries = getCandidateItemEntries(input.snapshot, input.config, input.configPath).filter(
		(entry) => input.blobShas.includes(entry.sha)
	);
	if (entries.length === 0) {
		const fieldIds = collectProjectionFieldIds(input.config);
		return {
			indexIdentity: createCollectionIndex(
				input.snapshot,
				input.config,
				input.configPath,
				input.slug,
				[],
				getProjectionSchemaIdentity(input.config, fieldIds)
			).identity,
			items: []
		};
	}

	const info = getTemplateInfo(input.configPath, input.config);
	const fieldIds = collectProjectionFieldIds(input.config);
	const schemaIdentity = getProjectionSchemaIdentity(input.config, fieldIds);
	const projections = await Promise.all(
		entries.map((entry) =>
			loadItemProjection(input.backend, entry, {
				filename: getFilename(entry.path),
				isMarkdown: info.isMarkdown,
				fieldIds,
				repoKey: input.snapshot.identity.repoKey,
				schemaIdentity
			})
		)
	);
	const presentEntries = entries.filter((_, index) => projections[index] !== null);
	const presentProjections = projections.filter((item): item is ContentRecord => item !== null);

	return {
		indexIdentity: createCollectionIndex(
			input.snapshot,
			input.config,
			input.configPath,
			input.slug,
			[],
			schemaIdentity
		).identity,
		items: toCollectionIndexItems(
			input.config,
			presentEntries,
			presentProjections,
			input.snapshot.rootConfig
		)
	};
}

async function buildFileCollectionIndex(input: {
	backend: Parameters<typeof readGitHubTextBlob>[0];
	snapshot: RepositorySnapshot;
	config: FileCollectionConfig;
	configPath: string;
	slug: string;
	entry: RepositoryTreeEntry;
}): Promise<CollectionIndex | null> {
	try {
		const fieldIds = collectProjectionFieldIds(input.config);
		const schemaIdentity = getProjectionSchemaIdentity(input.config, fieldIds);
		const content = parseFileCollectionItems(
			input.config,
			await readGitHubTextBlob(input.backend, input.entry.sha)
		);

		return createFileCollectionIndex({
			snapshot: input.snapshot,
			config: input.config,
			configPath: input.configPath,
			slug: input.slug,
			path: input.entry.path,
			blobSha: input.entry.sha,
			items: toFileCollectionIndexItems({
				config: input.config,
				content,
				path: input.entry.path,
				blobSha: input.entry.sha,
				rootConfig: input.snapshot.rootConfig
			}),
			schemaIdentity
		});
	} catch (err) {
		console.error(`Failed to build file collection index for ${input.entry.path}:`, err);
		return null;
	}
}

async function loadCollectionIndex(
	input: CollectionNavigationInput
): Promise<CollectionIndex | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const backend = input.backend;
	const start = performance.now();
	const snapshot = await getRepositorySnapshot({
		backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig?.config.collection) {
		return null;
	}

	let fileCollectionEntry: RepositoryTreeEntry | null = null;
	let cacheKey: string | null = null;
	if (isDirectoryBackedConfig(discoveredConfig.config)) {
		cacheKey = getCollectionIndexCacheKey(
			snapshot,
			discoveredConfig.config,
			discoveredConfig.path,
			input.slug
		);
	} else if (isFileCollectionConfig(discoveredConfig.config)) {
		fileCollectionEntry = getFileCollectionEntry({
			snapshot,
			config: discoveredConfig.config,
			configPath: discoveredConfig.path
		});
		cacheKey = fileCollectionEntry
			? getFileCollectionIndexCacheKey(
					snapshot,
					discoveredConfig.config,
					discoveredConfig.path,
					input.slug,
					fileCollectionEntry.sha
				)
			: null;
	}

	if (!cacheKey) {
		return null;
	}
	const cached = collectionIndexCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const index = isDirectoryBackedConfig(discoveredConfig.config)
		? await buildDirectoryCollectionIndex(
				input,
				snapshot,
				discoveredConfig.config,
				discoveredConfig.path
			)
		: isFileCollectionConfig(discoveredConfig.config) && fileCollectionEntry
			? await buildFileCollectionIndex({
					backend,
					snapshot,
					config: discoveredConfig.config,
					configPath: discoveredConfig.path,
					slug: input.slug,
					entry: fileCollectionEntry
				})
			: null;
	if (!index) {
		return null;
	}

	collectionIndexCache.set(cacheKey, index);
	logTiming('repository-data.collection-index.load', {
		repoKey: snapshot.identity.repoKey,
		ref: snapshot.identity.ref,
		treeSha: snapshot.identity.treeSha,
		slug: input.slug,
		itemCount: index.items.length,
		durationMs: performance.now() - start
	});
	return index;
}

export async function getCollectionIndex(
	input: CollectionNavigationInput
): Promise<CollectionIndex | null> {
	const inflightKey = `collection-index:${input.backend.cacheKey}:${input.ref ?? '<default>'}:${input.slug}`;
	const pending = collectionIndexInflight.get(inflightKey);
	if (pending) {
		return pending;
	}

	const promise = loadCollectionIndex(input).finally(() => {
		collectionIndexInflight.delete(inflightKey);
	});
	collectionIndexInflight.set(inflightKey, promise);
	return promise;
}

export async function hydrateCollectionProjections(
	input: CollectionNavigationInput & {
		blobShas: string[];
	}
): Promise<CollectionProjectionBatchResult | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig?.config.collection) {
		return null;
	}

	if (isDirectoryBackedConfig(discoveredConfig.config)) {
		return hydrateDirectoryCollectionEntries({
			backend: input.backend,
			snapshot,
			config: discoveredConfig.config,
			configPath: discoveredConfig.path,
			slug: input.slug,
			blobShas: input.blobShas
		});
	}

	if (isFileCollectionConfig(discoveredConfig.config)) {
		const index = await getCollectionIndex(input);
		if (!index) {
			return null;
		}

		return {
			indexIdentity: index.identity,
			items: index.items.filter((item) => input.blobShas.includes(item.blobSha))
		};
	}

	return null;
}

async function loadCollectionNavigation(
	input: CollectionNavigationInput
): Promise<OrderedCollectionNavigation | null> {
	const start = performance.now();
	const index = await getCollectionIndex(input);
	if (!index) {
		return null;
	}

	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig?.config.collection) {
		return null;
	}

	const cacheKey = getCollectionNavigationCacheKey(index);
	const cached = collectionNavigationCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const navigation = orderCollectionNavigationItems(
		discoveredConfig.config,
		index.items.map(({ itemId, title, sortDate, sortValues, state, hydration, hrefItemId }) => ({
			itemId,
			title,
			sortDate,
			sortValues,
			...(state ? { state } : {}),
			...(hydration ? { hydration } : {}),
			...(hrefItemId ? { hrefItemId } : {})
		})),
		snapshot.navigationManifest.manifest
	);

	collectionNavigationCache.set(cacheKey, navigation);
	logTiming('repository-data.collection-navigation.load', {
		repoKey: snapshot.identity.repoKey,
		ref: snapshot.identity.ref,
		treeSha: snapshot.identity.treeSha,
		slug: input.slug,
		itemCount: navigation.items.length,
		groupCount: navigation.groups.length,
		durationMs: performance.now() - start
	});
	return navigation;
}

export async function getCollectionNavigation(
	input: CollectionNavigationInput
): Promise<OrderedCollectionNavigation | null> {
	const inflightKey = `collection-navigation:${input.backend.cacheKey}:${input.ref ?? '<default>'}:${input.slug}`;
	const pending = collectionNavigationInflight.get(inflightKey);
	if (pending) {
		return pending;
	}

	const promise = loadCollectionNavigation(input).finally(() => {
		collectionNavigationInflight.delete(inflightKey);
	});
	collectionNavigationInflight.set(inflightKey, promise);
	return promise;
}

export async function resolveCollectionItemDocument(
	input: ResolveCollectionItemInput
): Promise<ResolvedCollectionItem | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig?.config.collection) {
		return null;
	}

	if (isFileCollectionConfig(discoveredConfig.config)) {
		const index = await getCollectionIndex(input);
		const indexItem =
			index?.byRoute.get(input.itemId) ??
			index?.byId.get(input.itemId) ??
			(/^\d+$/.test(input.itemId) ? index?.items[Number.parseInt(input.itemId, 10)] : undefined);
		if (!indexItem || typeof indexItem.index !== 'number') {
			return null;
		}

		const contentPath = resolveConfigPath(
			discoveredConfig.path,
			discoveredConfig.config.content.path
		);
		const entry = findBlobEntry(snapshot, contentPath);
		if (!entry) {
			return null;
		}

		const content = parseFileCollectionItems(
			discoveredConfig.config,
			await readGitHubTextBlob(input.backend, entry.sha)
		);
		const normalizedContent = normalizeRuntimeCollectionItemIds(discoveredConfig.config, content);
		const item = normalizedContent[indexItem.index];
		if (!item) {
			return null;
		}

		return {
			config: discoveredConfig,
			indexItem,
			content: item
		};
	}

	if (!isDirectoryBackedConfig(discoveredConfig.config)) {
		return null;
	}

	const info = getTemplateInfo(discoveredConfig.path, discoveredConfig.config);
	const entries = getCandidateItemEntries(snapshot, discoveredConfig.config, discoveredConfig.path);
	const directEntry = entries.find((entry) => {
		const filename = getFilename(entry.path);
		return filename === input.itemId || stripFileExtension(filename) === input.itemId;
	});
	const index = directEntry === undefined ? await getCollectionIndex(input) : null;
	let indexItem = index?.byRoute.get(input.itemId) ?? index?.byId.get(input.itemId);
	if (!directEntry && !indexItem) {
		const hydrated = await hydrateDirectoryCollectionEntries({
			backend: input.backend,
			snapshot,
			config: discoveredConfig.config,
			configPath: discoveredConfig.path,
			slug: input.slug,
			blobShas: entries.map((entry) => entry.sha)
		});
		indexItem =
			hydrated?.items.find((item) => item.route === input.itemId || item.itemId === input.itemId) ??
			undefined;
	}
	const path = directEntry?.path ?? indexItem?.path;
	const blobSha = directEntry?.sha ?? indexItem?.blobSha;
	if (!path || !blobSha) {
		return null;
	}

	const item = parseCollectionItem(
		await readGitHubTextBlob(input.backend, blobSha),
		info.isMarkdown,
		getFilename(path)
	);
	const normalized = normalizeRuntimeCollectionItemIds(discoveredConfig.config, [item]);
	const content = normalized[0] ?? item;
	const resolvedIndexItem =
		indexItem ??
		getCollectionIndexItemFromContent({
			config: discoveredConfig.config,
			content,
			path,
			blobSha
		});
	if (!resolvedIndexItem) {
		return null;
	}

	return {
		config: discoveredConfig,
		indexItem: resolvedIndexItem,
		content
	};
}

export async function resolveCollectionItem(
	input: ResolveCollectionItemInput
): Promise<ContentRecord | null> {
	const resolved = await resolveCollectionItemDocument(input);
	return resolved?.content ?? null;
}

export function clearCollectionNavigationCache(): void {
	clearGitHubTextBlobCache();
	projectionCache.clear();
	collectionIndexCache.clear();
	collectionIndexInflight.clear();
	collectionNavigationCache.clear();
	collectionNavigationInflight.clear();
}

function keyMatchesScope(
	key: string,
	input: {
		repoKey: string;
		ref?: string | null;
		changedPaths?: string[];
	}
): boolean {
	if (!key.includes(`:${input.repoKey}:`)) {
		return false;
	}

	if (input.ref && !key.includes(`:${input.ref}:`)) {
		return false;
	}

	const paths = input.changedPaths?.filter(Boolean) ?? [];
	if (paths.length === 0) {
		return true;
	}

	return paths.some((path) => key.includes(path));
}

export function clearCollectionNavigationCacheForScope(input: {
	repoKey: string;
	ref?: string | null;
	changedPaths?: string[];
}): void {
	for (const key of projectionCache.keys()) {
		if (keyMatchesScope(key, input)) {
			projectionCache.delete(key);
		}
	}

	for (const key of collectionIndexCache.keys()) {
		if (keyMatchesScope(key, input)) {
			collectionIndexCache.delete(key);
		}
	}

	for (const key of collectionIndexInflight.keys()) {
		if (keyMatchesScope(key, input)) {
			collectionIndexInflight.delete(key);
		}
	}

	for (const key of collectionNavigationCache.keys()) {
		if (keyMatchesScope(key, input)) {
			collectionNavigationCache.delete(key);
		}
	}

	for (const key of collectionNavigationInflight.keys()) {
		if (keyMatchesScope(key, input)) {
			collectionNavigationInflight.delete(key);
		}
	}
}
