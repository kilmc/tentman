import { browser } from '$app/environment';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import {
	orderCollectionNavigationItems,
	type CollectionNavigationItem,
	type OrderedCollectionNavigation
} from '$lib/features/content-management/navigation';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepoBootstrapIdentity, RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';

const DATABASE_NAME = 'tentman-github-repository-cache';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const COLLECTION_INDEX_STORE = 'collectionIndexes';
const PROJECTION_STORE = 'projections';
const DOCUMENT_STORE = 'documents';
const VISIBLE_PROJECTION_LIMIT = 30;
const BACKGROUND_PROJECTION_BATCH_SIZE = 20;

interface CachedSnapshot {
	key: string;
	repoFullName: string;
	ref: string;
	identity: RepoBootstrapIdentity;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	activeDraftBranch: string | null;
	updatedAt: number;
}

interface CollectionIndexIdentity {
	repoKey: string;
	ref: string;
	headSha: string;
	treeSha: string;
	configSlug: string;
	configPath: string;
	contentIdentity: string;
	schemaIdentity: string;
}

interface CollectionIndexItem extends CollectionNavigationItem {
	route: string;
	path: string;
	filename: string;
	blobSha: string;
	index?: number;
	state?: ResolvedContentState | null;
}

interface CollectionProjectionBatchResult {
	indexIdentity: CollectionIndexIdentity;
	items: CollectionIndexItem[];
}

interface SerializableCollectionIndex {
	key: string;
	identity: CollectionIndexIdentity;
	configSlug: string;
	mode: 'directory' | 'file';
	items: CollectionIndexItem[];
	updatedAt: number;
}

interface CachedProjection {
	key: string;
	repoFullName: string;
	blobSha: string;
	schemaIdentity: string;
	item: CollectionIndexItem;
	updatedAt: number;
}

interface CachedDocument {
	key: string;
	repoFullName: string;
	blobSha: string;
	configSlug: string;
	path: string;
	content: ContentRecord;
	updatedAt: number;
}

interface CachedItemDocumentResult {
	content: ContentRecord;
	indexItem: CollectionIndexItem;
}

type CollectionListener = (navigation: OrderedCollectionNavigation | null) => void;

let databasePromise: Promise<IDBDatabase> | null = null;
let activeSnapshot: CachedSnapshot | null = null;
const collectionListeners = new Map<string, Set<CollectionListener>>();

function openDatabase(): Promise<IDBDatabase> {
	if (!browser) {
		return Promise.reject(new Error('GitHub repository cache is only available in the browser'));
	}

	if (databasePromise) {
		return databasePromise;
	}

	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;
			for (const storeName of [
				SNAPSHOT_STORE,
				COLLECTION_INDEX_STORE,
				PROJECTION_STORE,
				DOCUMENT_STORE
			]) {
				if (!database.objectStoreNames.contains(storeName)) {
					database.createObjectStore(storeName, { keyPath: 'key' });
				}
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Failed to open cache database'));
	});

	return databasePromise;
}

async function readStore<T>(storeName: string, key: string): Promise<T | null> {
	const database = await openDatabase();
	return await new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const request = transaction.objectStore(storeName).get(key);
		request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

async function writeStore<T extends { key: string }>(storeName: string, value: T): Promise<void> {
	const database = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		transaction.objectStore(storeName).put(value);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
	});
}

async function readAllStore<T>(storeName: string): Promise<T[]> {
	const database = await openDatabase();
	return await new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const request = transaction.objectStore(storeName).getAll();
		request.onsuccess = () => resolve((request.result as T[]) ?? []);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

async function deleteStoreRecord(storeName: string, key: string): Promise<void> {
	const database = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		transaction.objectStore(storeName).delete(key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to delete ${storeName}`));
	});
}

function getSnapshotKey(repoFullName: string, ref: string): string {
	return `${repoFullName}:${ref}`;
}

function getCollectionIndexKey(identity: CollectionIndexIdentity): string {
	return [
		identity.repoKey,
		identity.ref,
		identity.treeSha,
		identity.configSlug,
		identity.contentIdentity,
		identity.schemaIdentity
	].join(':');
}

function getProjectionKey(input: {
	repoFullName: string;
	blobSha: string;
	schemaIdentity: string;
}): string {
	return `${input.repoFullName}:${input.blobSha}:${input.schemaIdentity}`;
}

function getDocumentKey(input: {
	repoFullName: string;
	blobSha: string;
	configSlug: string;
}): string {
	return `${input.repoFullName}:${input.blobSha}:${input.configSlug}`;
}

function getActiveRef(bootstrap: RepoConfigsBootstrap): string {
	return bootstrap.repositoryIdentity?.ref ?? bootstrap.activeDraftBranch ?? 'main';
}

function stripFileExtension(filename: string): string {
	return filename.replace(/\.[^/.]+$/, '');
}

function getActiveSnapshot(): CachedSnapshot | null {
	return activeSnapshot;
}

function getConfig(snapshot: CachedSnapshot, slug: string): DiscoveredConfig | null {
	return snapshot.configs.find((config) => config.slug === slug) ?? null;
}

async function getCachedCollectionIndex(
	slug: string
): Promise<SerializableCollectionIndex | null> {
	const snapshot = getActiveSnapshot();
	if (!snapshot) {
		return null;
	}

	const indexes = await readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE);
	return (
		indexes.find(
			(index) =>
				index.identity.repoKey === snapshot.identity.repoKey &&
				index.identity.ref === snapshot.identity.ref &&
				index.identity.treeSha === snapshot.identity.treeSha &&
				index.identity.configSlug === slug
		) ?? null
	);
}

async function writeCollectionIndex(index: Omit<SerializableCollectionIndex, 'key' | 'updatedAt'>) {
	await writeStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE, {
		...index,
		key: getCollectionIndexKey(index.identity),
		updatedAt: Date.now()
	});
}

async function writeProjectionItems(
	repoFullName: string,
	schemaIdentity: string,
	items: CollectionIndexItem[]
): Promise<void> {
	await Promise.all(
		items.map((item) =>
			writeStore<CachedProjection>(PROJECTION_STORE, {
				key: getProjectionKey({ repoFullName, blobSha: item.blobSha, schemaIdentity }),
				repoFullName,
				blobSha: item.blobSha,
				schemaIdentity,
				item,
				updatedAt: Date.now()
			})
		)
	);
}

async function mergeCachedProjections(
	index: SerializableCollectionIndex
): Promise<CollectionIndexItem[]> {
	const snapshot = getActiveSnapshot();
	if (!snapshot) {
		return index.items;
	}

	const projections = await Promise.all(
		index.items.map((item) =>
			readStore<CachedProjection>(
				PROJECTION_STORE,
				getProjectionKey({
					repoFullName: snapshot.repoFullName,
					blobSha: item.blobSha,
					schemaIdentity: index.identity.schemaIdentity
				})
			)
		)
	);
	const projectionByBlobSha = new Map(
		projections.flatMap((projection) =>
			projection ? [[projection.blobSha, projection.item] as const] : []
		)
	);

	return index.items.map((item) => projectionByBlobSha.get(item.blobSha) ?? item);
}

function isMatchingCollectionIndexItem(item: CollectionIndexItem, itemId: string): boolean {
	return (
		item.itemId === itemId ||
		item.hrefItemId === itemId ||
		item.route === itemId ||
		stripFileExtension(item.filename) === itemId
	);
}

function isRepositoryStructurePath(path: string): boolean {
	return (
		path === 'tentman.json' ||
		path.endsWith('.tentman.json') ||
		path === 'tentman/navigation-manifest.json'
	);
}

function indexMatchesActiveSnapshot(index: SerializableCollectionIndex, snapshot: CachedSnapshot) {
	return (
		index.identity.repoKey === snapshot.identity.repoKey &&
		index.identity.ref === snapshot.identity.ref
	);
}

function isPathInCollectionIdentity(path: string, index: SerializableCollectionIndex): boolean {
	const [contentPath] = index.identity.contentIdentity.split(':');
	if (!contentPath) {
		return false;
	}

	return path === contentPath || path.startsWith(`${contentPath}/`);
}

async function getCachedCollectionIndexItem(
	slug: string,
	itemId: string
): Promise<CollectionIndexItem | null> {
	const index = await getCachedCollectionIndex(slug);
	if (!index) {
		return null;
	}

	const items = await mergeCachedProjections(index);
	return items.find((item) => isMatchingCollectionIndexItem(item, itemId)) ?? null;
}

async function notifyCollection(slug: string): Promise<void> {
	const listeners = collectionListeners.get(slug);
	if (!listeners?.size) {
		return;
	}

	const navigation = await githubRepositoryCache.getCollectionNavigation(slug);
	for (const listener of listeners) {
		listener(navigation);
	}
}

async function hydrateProjectionBatch(input: {
	fetcher: typeof fetch;
	slug: string;
	blobShas: string[];
}): Promise<void> {
	const snapshot = getActiveSnapshot();
	if (!snapshot || input.blobShas.length === 0) {
		return;
	}

	const response = await input.fetcher('/api/repo/collection-projections', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			slug: input.slug,
			blobShas: input.blobShas
		})
	});

	if (!response.ok) {
		throw new Error(`Failed to hydrate collection projections (${response.status})`);
	}

	const result = (await response.json()) as CollectionProjectionBatchResult;
	await writeProjectionItems(
		snapshot.repoFullName,
		result.indexIdentity.schemaIdentity,
		result.items
	);
	await notifyCollection(input.slug);
}

export const githubRepositoryCache = {
	async hydrateFromBootstrap(input: {
		repoFullName: string;
		bootstrap: RepoConfigsBootstrap;
	}): Promise<void> {
		if (!browser || !input.bootstrap.repositoryIdentity) {
			activeSnapshot = null;
			return;
		}

		const snapshot: CachedSnapshot = {
			key: getSnapshotKey(input.repoFullName, getActiveRef(input.bootstrap)),
			repoFullName: input.repoFullName,
			ref: getActiveRef(input.bootstrap),
			identity: input.bootstrap.repositoryIdentity,
			configs: input.bootstrap.configs,
			blockConfigs: input.bootstrap.blockConfigs,
			rootConfig: input.bootstrap.rootConfig,
			navigationManifest: input.bootstrap.navigationManifest,
			activeDraftBranch: input.bootstrap.activeDraftBranch,
			updatedAt: Date.now()
		};
		activeSnapshot = snapshot;
		await writeStore(SNAPSHOT_STORE, snapshot);
	},

	onCollectionChange(slug: string, listener: CollectionListener): () => void {
		const listeners = collectionListeners.get(slug) ?? new Set<CollectionListener>();
		listeners.add(listener);
		collectionListeners.set(slug, listeners);

		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) {
				collectionListeners.delete(slug);
			}
		};
	},

	async getCollectionNavigation(slug: string): Promise<OrderedCollectionNavigation | null> {
		if (!browser) {
			return null;
		}

		const snapshot = getActiveSnapshot();
		const index = await getCachedCollectionIndex(slug);
		if (!snapshot || !index) {
			return null;
		}

		const config = getConfig(snapshot, slug);
		if (!config?.config.collection) {
			return null;
		}

		const items = await mergeCachedProjections(index);
		return orderCollectionNavigationItems(
			config.config,
			items.map(({ itemId, title, sortDate, state, hydration, hrefItemId }) => ({
				itemId,
				title,
				sortDate,
				...(state ? { state } : {}),
				...(hydration ? { hydration } : {}),
				...(hrefItemId ? { hrefItemId } : {})
			})),
			snapshot.navigationManifest.manifest
		);
	},

	async ensureCollectionIndex(
		slug: string,
		options: {
			fetcher: typeof fetch;
			force?: boolean;
		}
	): Promise<void> {
		if (!browser || !getActiveSnapshot()) {
			return;
		}

		const cached = options.force ? null : await getCachedCollectionIndex(slug);
		if (cached) {
			await notifyCollection(slug);
			return;
		}

		const response = await options.fetcher(
			`/api/repo/collection-index?slug=${encodeURIComponent(slug)}`
		);

		if (!response.ok) {
			throw new Error(`Failed to load collection index (${response.status})`);
		}

		const payload = (await response.json()) as Omit<
			SerializableCollectionIndex,
			'key' | 'updatedAt'
		>;
		await writeCollectionIndex(payload);
		await notifyCollection(slug);
	},

	async warmCollection(
		slug: string,
		options: {
			fetcher: typeof fetch;
			visibleLimit?: number;
			force?: boolean;
		}
	): Promise<void> {
		if (!browser || !getActiveSnapshot()) {
			return;
		}

		await githubRepositoryCache.ensureCollectionIndex(slug, {
			fetcher: options.fetcher,
			force: options.force
		});
		const index = await getCachedCollectionIndex(slug);

		if (!index) {
			return;
		}

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return;
		}

		const missingBlobShas = (
			await Promise.all(
				index.items.map(async (item) => {
					const cached = await readStore<CachedProjection>(
						PROJECTION_STORE,
						getProjectionKey({
							repoFullName: snapshot.repoFullName,
							blobSha: item.blobSha,
							schemaIdentity: index.identity.schemaIdentity
						})
					);
					return cached ? null : item.blobSha;
				})
			)
		).filter((blobSha): blobSha is string => typeof blobSha === 'string');

		const visibleLimit = options.visibleLimit ?? VISIBLE_PROJECTION_LIMIT;
		const visibleBlobShas = missingBlobShas.slice(0, visibleLimit);
		await hydrateProjectionBatch({
			fetcher: options.fetcher,
			slug,
			blobShas: visibleBlobShas
		});

		const remainingBlobShas = missingBlobShas.slice(visibleLimit);
		void (async () => {
			for (let index = 0; index < remainingBlobShas.length; index += BACKGROUND_PROJECTION_BATCH_SIZE) {
				await hydrateProjectionBatch({
					fetcher: options.fetcher,
					slug,
					blobShas: remainingBlobShas.slice(index, index + BACKGROUND_PROJECTION_BATCH_SIZE)
				});
			}
		})().catch((error) => {
			console.error(`Failed to hydrate background projections for ${slug}:`, error);
		});
	},

	async getItemDocument(input: {
		repoFullName: string;
		blobSha: string;
		configSlug: string;
	}): Promise<ContentRecord | null> {
		if (!browser) {
			return null;
		}

		const cached = await readStore<CachedDocument>(DOCUMENT_STORE, getDocumentKey(input));
		return cached?.content ?? null;
	},

	async getItemDocumentForRoute(input: {
		slug: string;
		itemId: string;
	}): Promise<CachedItemDocumentResult | null> {
		if (!browser) {
			return null;
		}

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return null;
		}

		const indexItem = await getCachedCollectionIndexItem(input.slug, input.itemId);
		if (!indexItem) {
			return null;
		}

		const content = await githubRepositoryCache.getItemDocument({
			repoFullName: snapshot.repoFullName,
			blobSha: indexItem.blobSha,
			configSlug: input.slug
		});
		return content ? { content, indexItem } : null;
	},

	async setItemDocument(input: {
		repoFullName: string;
		blobSha: string;
		configSlug: string;
		path: string;
		content: ContentRecord;
	}): Promise<void> {
		if (!browser) {
			return;
		}

		await writeStore<CachedDocument>(DOCUMENT_STORE, {
			key: getDocumentKey(input),
			...input,
			updatedAt: Date.now()
		});
	},

	async setItemDocumentForRoute(input: {
		slug: string;
		itemId: string;
		content: ContentRecord | null;
	}): Promise<void> {
		if (!browser || !input.content) {
			return;
		}

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return;
		}

		const indexItem = await getCachedCollectionIndexItem(input.slug, input.itemId);
		if (!indexItem) {
			return;
		}

		await githubRepositoryCache.setItemDocument({
			repoFullName: snapshot.repoFullName,
			blobSha: indexItem.blobSha,
			configSlug: input.slug,
			path: indexItem.path,
			content: input.content
		});
	},

	async invalidatePaths(changedPaths: string[]): Promise<void> {
		if (!browser || changedPaths.length === 0) {
			return;
		}

		const snapshot = getActiveSnapshot();
		const hasRepositoryStructureChange = changedPaths.some(isRepositoryStructurePath);
		const [snapshots, indexes, projections, documents] = await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE)
		]);
		const indexesToDelete = indexes.filter(
			(index) =>
				index.items.some((item) => changedPaths.includes(item.path)) ||
				changedPaths.some((path) => isPathInCollectionIdentity(path, index)) ||
				(hasRepositoryStructureChange && snapshot && indexMatchesActiveSnapshot(index, snapshot))
		);
		const affectedSlugs = new Set(indexesToDelete.map((index) => index.configSlug));

		await Promise.all([
			...(hasRepositoryStructureChange && snapshot
				? snapshots
						.filter(
							(record) =>
								record.identity.repoKey === snapshot.identity.repoKey &&
								record.identity.ref === snapshot.identity.ref
						)
						.map((record) => deleteStoreRecord(SNAPSHOT_STORE, record.key))
				: []),
			...indexesToDelete.map((index) => deleteStoreRecord(COLLECTION_INDEX_STORE, index.key)),
			...projections
				.filter((projection) => changedPaths.includes(projection.item.path))
				.map((projection) => deleteStoreRecord(PROJECTION_STORE, projection.key)),
			...documents
				.filter((document) => changedPaths.includes(document.path))
				.map((document) => deleteStoreRecord(DOCUMENT_STORE, document.key))
		]);

		if (hasRepositoryStructureChange && snapshot && activeSnapshot?.key === snapshot.key) {
			activeSnapshot = null;
		}

		await Promise.all([...affectedSlugs].map((slug) => notifyCollection(slug)));
	},

	async clearRepo(repoFullName: string): Promise<void> {
		if (!browser) {
			return;
		}

		const [snapshots, indexes, projections, documents] = await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE)
		]);
		await Promise.all([
			...snapshots
				.filter((snapshot) => snapshot.repoFullName === repoFullName)
				.map((snapshot) => deleteStoreRecord(SNAPSHOT_STORE, snapshot.key)),
			...indexes
				.filter((index) => index.identity.repoKey.includes(repoFullName))
				.map((index) => deleteStoreRecord(COLLECTION_INDEX_STORE, index.key)),
			...projections
				.filter((projection) => projection.repoFullName === repoFullName)
				.map((projection) => deleteStoreRecord(PROJECTION_STORE, projection.key)),
			...documents
				.filter((document) => document.repoFullName === repoFullName)
				.map((document) => deleteStoreRecord(DOCUMENT_STORE, document.key))
		]);

		if (activeSnapshot?.repoFullName === repoFullName) {
			activeSnapshot = null;
		}
	},

	async clearRepoRef(input: { repoFullName: string; ref: string }): Promise<void> {
		if (!browser) {
			return;
		}

		const [snapshots, indexes] = await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE)
		]);
		await Promise.all([
			...snapshots
				.filter(
					(snapshot) =>
						snapshot.repoFullName === input.repoFullName && snapshot.identity.ref === input.ref
				)
				.map((snapshot) => deleteStoreRecord(SNAPSHOT_STORE, snapshot.key)),
			...indexes
				.filter(
					(index) =>
						index.identity.repoKey.includes(input.repoFullName) && index.identity.ref === input.ref
				)
				.map((index) => deleteStoreRecord(COLLECTION_INDEX_STORE, index.key))
		]);

		if (
			activeSnapshot?.repoFullName === input.repoFullName &&
			activeSnapshot.identity.ref === input.ref
		) {
			activeSnapshot = null;
		}
	}
};

export const githubRepositoryCacheTestApi = {
	async reset(): Promise<void> {
		if (!browser) {
			activeSnapshot = null;
			return;
		}

		const database = await databasePromise?.catch(() => null);
		database?.close();
		databasePromise = null;
		activeSnapshot = null;
		collectionListeners.clear();

		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(DATABASE_NAME);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error ?? new Error('Failed to clear cache database'));
			request.onblocked = () => reject(new Error('Cache database deletion was blocked'));
		});
	},

	async getCollectionIndex(slug: string): Promise<SerializableCollectionIndex | null> {
		return getCachedCollectionIndex(slug);
	},

	async getCollectionIndexItem(slug: string, itemId: string): Promise<CollectionIndexItem | null> {
		return getCachedCollectionIndexItem(slug, itemId);
	}
};
