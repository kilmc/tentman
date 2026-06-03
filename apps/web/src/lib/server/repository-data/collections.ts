import matter from 'gray-matter';
import type { ParsedContentConfig } from '$lib/config/parse';
import { getItemId, getItemRoute } from '$lib/features/content-management/item';
import {
	getOrderedCollectionNavigation,
	orderCollectionNavigationItems
} from '$lib/features/content-management/navigation';
import type { OrderedCollectionNavigation } from '$lib/features/content-management/navigation';
import { normalizeRuntimeCollectionItemIds } from '$lib/features/content-management/stable-identity';
import { getTemplateInfo, parseCollectionItem } from '$lib/features/content-management/transforms';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import { resolveConfigPath } from '$lib/utils/validation';
import { canUseGitHubSource, readGitHubTextBlob } from './source';
import { getRepositorySnapshot } from './snapshot';
import type {
	CollectionIndex,
	CollectionIndexItem,
	RepositorySnapshot,
	RepositoryTreeEntry
} from './types';

type DirectoryBackedConfig = ParsedContentConfig & {
	content: {
		mode: 'directory';
		path: string;
		template: string;
		filename?: string;
	};
};

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

function getFilename(path: string): string {
	return path.split('/').pop() ?? path;
}

function stripFileExtension(filename: string): string {
	return filename.replace(/\.[^/.]+$/, '');
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
		sorting: collection?.sorting ?? null,
		groups: collection?.groups?.map((group) => ({
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
				...(navigationItem?.state ? { state: navigationItem.state } : {})
			}
		];
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

async function buildDirectoryCollectionIndex(
	input: CollectionNavigationInput,
	snapshot: RepositorySnapshot,
	config: DirectoryBackedConfig,
	configPath: string
): Promise<CollectionIndex | null> {
	if (!canUseGitHubSource(input.backend) || !snapshot.tree) {
		return null;
	}

	const backend = input.backend;
	const entries = getCandidateItemEntries(snapshot, config, configPath);
	const info = getTemplateInfo(configPath, config);
	const fieldIds = collectProjectionFieldIds(config);
	const schemaIdentity = getProjectionSchemaIdentity(config, fieldIds);
	const projections = await Promise.all(
		entries.map((entry) =>
			loadItemProjection(backend, entry, {
				filename: getFilename(entry.path),
				isMarkdown: info.isMarkdown,
				fieldIds,
				repoKey: snapshot.identity.repoKey,
				schemaIdentity
			})
		)
	);
	const presentEntries = entries.filter((_, index) => projections[index] !== null);
	const presentProjections = projections.filter((item): item is ContentRecord => item !== null);

	return createCollectionIndex(
		snapshot,
		config,
		configPath,
		input.slug,
		toCollectionIndexItems(config, presentEntries, presentProjections, snapshot.rootConfig),
		schemaIdentity
	);
}

async function loadCollectionIndex(input: CollectionNavigationInput): Promise<CollectionIndex | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const start = performance.now();
	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig?.config.collection || !isDirectoryBackedConfig(discoveredConfig.config)) {
		return null;
	}

	const cacheKey = getCollectionIndexCacheKey(
		snapshot,
		discoveredConfig.config,
		discoveredConfig.path,
		input.slug
	);
	const cached = collectionIndexCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const index = await buildDirectoryCollectionIndex(
		input,
		snapshot,
		discoveredConfig.config,
		discoveredConfig.path
	);
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
	if (!discoveredConfig?.config.collection || !isDirectoryBackedConfig(discoveredConfig.config)) {
		return null;
	}

	const cacheKey = getCollectionNavigationCacheKey(index);
	const cached = collectionNavigationCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const navigation = orderCollectionNavigationItems(
		discoveredConfig.config,
		index.items.map(({ itemId, title, sortDate, state }) => ({
			itemId,
			title,
			sortDate,
			...(state ? { state } : {})
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

export async function resolveCollectionItem(
	input: ResolveCollectionItemInput
): Promise<ContentRecord | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig?.config.collection || !isDirectoryBackedConfig(discoveredConfig.config)) {
		return null;
	}

	const info = getTemplateInfo(discoveredConfig.path, discoveredConfig.config);
	const directEntry = getCandidateItemEntries(snapshot, discoveredConfig.config, discoveredConfig.path).find(
		(entry) => {
			const filename = getFilename(entry.path);
			return filename === input.itemId || stripFileExtension(filename) === input.itemId;
		}
	);
	const index = directEntry === undefined ? await getCollectionIndex(input) : null;
	const indexItem = index?.byRoute.get(input.itemId) ?? index?.byId.get(input.itemId);
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
	return normalized[0] ?? item;
}

export function clearCollectionNavigationCache(): void {
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
