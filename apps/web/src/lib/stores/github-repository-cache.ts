import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
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
import type { SerializablePackageBlock } from '$lib/blocks/packages';
import type {
	RepoBootstrapIdentity,
	RepoConfigsBootstrap,
	RepoSingletonContentIdentity
} from '$lib/repository/config-bootstrap';

const DATABASE_NAME = 'tentman-github-repository-cache';
const DATABASE_VERSION = 3;
const SNAPSHOT_STORE = 'snapshots';
const COLLECTION_INDEX_STORE = 'collectionIndexes';
const PROJECTION_STORE = 'projections';
const DOCUMENT_STORE = 'documents';
const SINGLETON_DOCUMENT_STORE = 'singletonDocuments';
const BLOCK_SUPPORT_STORE = 'blockSupport';
const INVENTORY_STORE = 'inventory';
const REQUIRED_STORE_NAMES = [
	SNAPSHOT_STORE,
	COLLECTION_INDEX_STORE,
	PROJECTION_STORE,
	DOCUMENT_STORE,
	SINGLETON_DOCUMENT_STORE,
	BLOCK_SUPPORT_STORE,
	INVENTORY_STORE
] as const;
const VISIBLE_PROJECTION_LIMIT = 30;
const BACKGROUND_PROJECTION_BATCH_SIZE = 20;
const SITE_WARM_PROJECTION_BATCH_SIZE = 20;
const SITE_WARM_READY_RESET_MS = 2500;
const CACHE_PROGRESS_LARGE_TASK_THRESHOLD = 25;
const CACHE_PROGRESS_SLOW_JOB_MS = 800;
const DEFAULT_FULL_DOCUMENT_BUDGET_BYTES = 50 * 1024 * 1024;
const DEFAULT_FULL_DOCUMENT_RECORD_LIMIT = 2500;
const FRESHNESS_BACKOFF_INTERVALS_MS = [5, 15, 30, 60].map((minutes) => minutes * 60 * 1000);

let fullDocumentBudgetPolicy = {
	bytes: DEFAULT_FULL_DOCUMENT_BUDGET_BYTES,
	recordLimit: DEFAULT_FULL_DOCUMENT_RECORD_LIMIT
};

export type GithubCacheWarmPhase =
	| 'idle'
	| 'checking'
	| 'warming'
	| 'hydrating'
	| 'ready'
	| 'error';

export interface GithubCacheWarmStatus {
	phase: GithubCacheWarmPhase;
	message: string | null;
	currentCollectionSlug: string | null;
	totalCollections: number;
	warmedCollections: number;
	totalItems: number;
	hydratedItems: number;
	totalTasks: number;
	completedTasks: number;
	showProgress: boolean;
	error: string | null;
}

export interface GithubCacheTaskKindDebug {
	total: number;
	completed: number;
	error: number;
	queued: number;
	running: number;
}

export interface GithubCacheWarmDebugStatus extends GithubCacheWarmStatus {
	activeRepoFullName: string | null;
	activeRef: string | null;
	activeTreeSha: string | null;
	activeIdentityKey: string | null;
	queuedTasks: number;
	runningTasks: number;
	doneTasks: number;
	errorTasks: number;
	pendingTaskKinds: CacheTaskKind[];
	pendingTaskKeys: string[];
	runningTaskKind: CacheTaskKind | null;
	taskKinds: Record<CacheTaskKind, GithubCacheTaskKindDebug>;
}

export type GithubCacheInventoryTargetType =
	| 'snapshot'
	| 'blockSupport'
	| 'singletonDocument'
	| 'collectionIndex'
	| 'collectionProjection'
	| 'itemDocument';

export type GithubCacheInventoryStatus =
	| 'fresh'
	| 'missing'
	| 'stale'
	| 'refreshing'
	| 'error'
	| 'skipped-budget';

export interface GithubCacheInventoryRecord {
	key: string;
	targetId: string;
	targetType: GithubCacheInventoryTargetType;
	repoFullName: string;
	workspaceKey: string;
	activeRef: string;
	mainHeadSha: string | null;
	mainTreeSha: string | null;
	draftHeadSha: string | null;
	draftTreeSha: string | null;
	path: string | null;
	label: string;
	configSlug: string | null;
	itemId: string | null;
	blobSha: string | null;
	schemaIdentity: string | null;
	dependencyIdentity: string | null;
	status: GithubCacheInventoryStatus;
	lastCachedAt: number | null;
	lastCheckedAt: number | null;
	estimatedBytes: number | null;
	error: string | null;
}

export interface GithubCacheInventorySummary {
	workspaceKey: string | null;
	repoFullName: string | null;
	activeRef: string | null;
	activeHeadSha: string | null;
	activeTreeSha: string | null;
	lastCheckedAt: number | null;
	totalTargets: number;
	cachedTargets: number;
	staleTargets: number;
	missingTargets: number;
	refreshingTargets: number;
	errorTargets: number;
	skippedBudgetTargets: number;
	storageBytes: number;
	documentBudgetBytes: number;
	documentRecordLimit: number;
	documentRecords: number;
	budgetLimited: boolean;
	records: GithubCacheInventoryRecord[];
}

interface CachedSnapshot {
	key: string;
	repoFullName: string;
	ref: string;
	identity: RepoBootstrapIdentity;
	configs: DiscoveredConfig[];
	blockConfigs: DiscoveredBlockConfig[];
	rootConfig: RootConfig | null;
	navigationManifest: NavigationManifestState;
	singletonContentIdentities: Record<string, RepoSingletonContentIdentity>;
	activeDraftBranch: string | null;
	mainRepositoryIdentity: RepoBootstrapIdentity | null;
	draftRepositoryIdentity: RepoBootstrapIdentity | null;
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
	ref?: string;
	blobSha: string;
	configSlug: string;
	path: string;
	content: ContentRecord;
	updatedAt: number;
}

interface CachedSingletonDocument {
	key: string;
	repoFullName: string;
	ref: string;
	treeSha: string;
	configSlug: string;
	blobSha?: string | null;
	path: string;
	content: ContentRecord;
	updatedAt: number;
}

interface CachedBlockSupport {
	key: string;
	repoFullName: string;
	ref: string;
	treeSha: string;
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
	updatedAt: number;
}

interface CachedItemDocumentResult {
	content: ContentRecord;
	indexItem: CollectionIndexItem;
}

interface CachedSingletonDocumentResult {
	content: ContentRecord;
	blockSupport: CachedBlockSupport | null;
}

type FreshnessBootstrap = RepoConfigsBootstrap & {
	mainRepositoryIdentity?: RepoBootstrapIdentity | null;
	draftRepositoryIdentity?: RepoBootstrapIdentity | null;
	changedPaths?: string[] | null;
};

type CacheTaskKind =
	| 'blockRegistry'
	| 'singletonDocument'
	| 'collectionIndex'
	| 'collectionProjectionBatch'
	| 'itemDocument';

type CacheTaskPriority = 'foreground' | 'intent' | 'topLevel' | 'passive';

interface CacheTask<T = unknown> {
	key: string;
	kind: CacheTaskKind;
	priority: number;
	passive: boolean;
	order: number;
	status: 'queued' | 'running' | 'done' | 'error';
	run: () => Promise<T>;
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

type CollectionListener = (navigation: OrderedCollectionNavigation | null) => void;
type IdleWindow = {
	requestIdleCallback?: typeof window.requestIdleCallback;
	cancelIdleCallback?: typeof window.cancelIdleCallback;
};

let databasePromise: Promise<IDBDatabase> | null = null;
let activeSnapshot: CachedSnapshot | null = null;
let activeSnapshotIdentityKey: string | null = null;
let siteWarmRunId = 0;
let warmReadyResetTimer: ReturnType<typeof setTimeout> | null = null;
let warmProgressRevealTimer: ReturnType<typeof setTimeout> | null = null;
let taskOrder = 0;
let totalQueuedTasks = 0;
let completedQueuedTasks = 0;
let erroredQueuedTasks = 0;
let queueScheduled = false;
let runningTask: CacheTask | null = null;
let freshnessTimer: ReturnType<typeof setTimeout> | null = null;
let freshnessBackoffIndex = 0;
let freshnessCheckInFlight: Promise<void> | null = null;
const collectionListeners = new Map<string, Set<CollectionListener>>();
const cacheTasks = new Map<string, CacheTask<unknown>>();
const totalQueuedTasksByKind = new Map<CacheTaskKind, number>();
const completedQueuedTasksByKind = new Map<CacheTaskKind, number>();
const erroredQueuedTasksByKind = new Map<CacheTaskKind, number>();

const emptyInventorySummary: GithubCacheInventorySummary = {
	workspaceKey: null,
	repoFullName: null,
	activeRef: null,
	activeHeadSha: null,
	activeTreeSha: null,
	lastCheckedAt: null,
	totalTargets: 0,
	cachedTargets: 0,
	staleTargets: 0,
	missingTargets: 0,
	refreshingTargets: 0,
	errorTargets: 0,
	skippedBudgetTargets: 0,
	storageBytes: 0,
	documentBudgetBytes: DEFAULT_FULL_DOCUMENT_BUDGET_BYTES,
	documentRecordLimit: DEFAULT_FULL_DOCUMENT_RECORD_LIMIT,
	documentRecords: 0,
	budgetLimited: false,
	records: []
};

export const githubCacheWarmStatus = writable<GithubCacheWarmStatus>({
	phase: 'idle',
	message: null,
	currentCollectionSlug: null,
	totalCollections: 0,
	warmedCollections: 0,
	totalItems: 0,
	hydratedItems: 0,
	totalTasks: 0,
	completedTasks: 0,
	showProgress: false,
	error: null
});

export const githubCacheWarmDebugStatus = writable<GithubCacheWarmDebugStatus>(
	createWarmDebugStatus(get(githubCacheWarmStatus))
);

export const githubCacheInventoryStatus =
	writable<GithubCacheInventorySummary>(emptyInventorySummary);

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
			for (const storeName of REQUIRED_STORE_NAMES) {
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

async function openDatabaseWithStore(storeName: string): Promise<IDBDatabase | null> {
	let database = await openDatabase();
	if (database.objectStoreNames.contains(storeName)) {
		return database;
	}

	database.close();
	databasePromise = null;
	database = await openDatabase();
	if (database.objectStoreNames.contains(storeName)) {
		return database;
	}

	console.warn(
		`GitHub repository cache store "${storeName}" is unavailable; skipping cache access.`
	);
	return null;
}

async function readStore<T>(storeName: string, key: string): Promise<T | null> {
	const database = await openDatabaseWithStore(storeName);
	if (!database) {
		return null;
	}

	return await new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const request = transaction.objectStore(storeName).get(key);
		request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

async function writeStore<T extends { key: string }>(storeName: string, value: T): Promise<void> {
	const database = await openDatabaseWithStore(storeName);
	if (!database) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		transaction.objectStore(storeName).put(value);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
	});
}

async function readAllStore<T>(storeName: string): Promise<T[]> {
	const database = await openDatabaseWithStore(storeName);
	if (!database) {
		return [];
	}

	return await new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const request = transaction.objectStore(storeName).getAll();
		request.onsuccess = () => resolve((request.result as T[]) ?? []);
		request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
	});
}

async function deleteStoreRecord(storeName: string, key: string): Promise<void> {
	const database = await openDatabaseWithStore(storeName);
	if (!database) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		transaction.objectStore(storeName).delete(key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error(`Failed to delete ${storeName}`));
	});
}

async function readActiveInventoryRecords(): Promise<GithubCacheInventoryRecord[]> {
	const snapshot = getActiveSnapshot();
	if (!snapshot) {
		return [];
	}

	const workspaceKey = getWorkspaceKey(snapshot);
	const records = await readAllStore<GithubCacheInventoryRecord>(INVENTORY_STORE);
	return records.filter((record) => record.workspaceKey === workspaceKey);
}

function createInventoryRecord(input: {
	snapshot: CachedSnapshot;
	targetId: string;
	targetType: GithubCacheInventoryTargetType;
	label: string;
	path?: string | null;
	configSlug?: string | null;
	itemId?: string | null;
	blobSha?: string | null;
	schemaIdentity?: string | null;
	dependencyIdentity?: string | null;
	status?: GithubCacheInventoryStatus;
	estimatedBytes?: number | null;
	lastCachedAt?: number | null;
}): GithubCacheInventoryRecord {
	const workspaceKey = getWorkspaceKey(input.snapshot);
	return {
		key: `${workspaceKey}:${input.targetId}`,
		targetId: input.targetId,
		targetType: input.targetType,
		repoFullName: input.snapshot.repoFullName,
		workspaceKey,
		activeRef: input.snapshot.identity.ref,
		mainHeadSha: input.snapshot.mainRepositoryIdentity?.headSha ?? null,
		mainTreeSha: input.snapshot.mainRepositoryIdentity?.treeSha ?? null,
		draftHeadSha: input.snapshot.draftRepositoryIdentity?.headSha ?? null,
		draftTreeSha: input.snapshot.draftRepositoryIdentity?.treeSha ?? null,
		path: input.path ?? null,
		label: input.label,
		configSlug: input.configSlug ?? null,
		itemId: input.itemId ?? null,
		blobSha: input.blobSha ?? null,
		schemaIdentity: input.schemaIdentity ?? null,
		dependencyIdentity: input.dependencyIdentity ?? input.snapshot.identity.treeSha,
		status: input.status ?? 'missing',
		lastCachedAt: input.lastCachedAt ?? null,
		lastCheckedAt: Date.now(),
		estimatedBytes: input.estimatedBytes ?? null,
		error: null
	};
}

async function upsertInventoryRecord(record: GithubCacheInventoryRecord): Promise<void> {
	await writeStore<GithubCacheInventoryRecord>(INVENTORY_STORE, record);
}

async function updateInventoryTarget(
	targetId: string,
	updates: Partial<
		Pick<
			GithubCacheInventoryRecord,
			| 'status'
			| 'lastCachedAt'
			| 'lastCheckedAt'
			| 'estimatedBytes'
			| 'error'
			| 'blobSha'
			| 'path'
			| 'schemaIdentity'
		>
	>
): Promise<void> {
	const existing = await readStore<GithubCacheInventoryRecord>(
		INVENTORY_STORE,
		getInventoryKey(targetId)
	);
	if (!existing) {
		return;
	}

	await upsertInventoryRecord({
		...existing,
		...updates,
		lastCheckedAt: updates.lastCheckedAt ?? Date.now()
	});
	await refreshInventoryStatus();
}

async function updateInventoryRecords(
	records: GithubCacheInventoryRecord[],
	updates: Partial<
		Pick<
			GithubCacheInventoryRecord,
			'status' | 'lastCheckedAt' | 'error' | 'lastCachedAt' | 'estimatedBytes'
		>
	>
): Promise<void> {
	await Promise.all(
		records.map((record) =>
			upsertInventoryRecord({
				...record,
				...updates,
				lastCheckedAt: updates.lastCheckedAt ?? Date.now()
			})
		)
	);
	await refreshInventoryStatus();
}

function createInventorySummary(
	records: GithubCacheInventoryRecord[]
): GithubCacheInventorySummary {
	const snapshot = getActiveSnapshot();
	const documentRecords = records.filter((record) => record.targetType === 'itemDocument');
	const storageBytes = records.reduce((total, record) => total + (record.estimatedBytes ?? 0), 0);
	const latestCheckedAt = records.reduce<number | null>(
		(latest, record) =>
			record.lastCheckedAt && (!latest || record.lastCheckedAt > latest)
				? record.lastCheckedAt
				: latest,
		null
	);

	return {
		workspaceKey: snapshot ? getWorkspaceKey(snapshot) : null,
		repoFullName: snapshot?.repoFullName ?? null,
		activeRef: snapshot?.identity.ref ?? null,
		activeHeadSha: snapshot?.identity.headSha ?? null,
		activeTreeSha: snapshot?.identity.treeSha ?? null,
		lastCheckedAt: latestCheckedAt,
		totalTargets: records.length,
		cachedTargets: records.filter((record) => record.status === 'fresh').length,
		staleTargets: records.filter((record) => record.status === 'stale').length,
		missingTargets: records.filter((record) => record.status === 'missing').length,
		refreshingTargets: records.filter((record) => record.status === 'refreshing').length,
		errorTargets: records.filter((record) => record.status === 'error').length,
		skippedBudgetTargets: records.filter((record) => record.status === 'skipped-budget').length,
		storageBytes,
		documentBudgetBytes: fullDocumentBudgetPolicy.bytes,
		documentRecordLimit: fullDocumentBudgetPolicy.recordLimit,
		documentRecords: documentRecords.filter((record) => record.status === 'fresh').length,
		budgetLimited:
			storageBytes > fullDocumentBudgetPolicy.bytes ||
			documentRecords.length > fullDocumentBudgetPolicy.recordLimit ||
			records.some((record) => record.status === 'skipped-budget'),
		records: [...records].sort(
			(a, b) =>
				getRecordStatusClass(a.status) - getRecordStatusClass(b.status) ||
				a.targetType.localeCompare(b.targetType) ||
				a.label.localeCompare(b.label)
		)
	};
}

async function refreshInventoryStatus(): Promise<void> {
	if (!browser) {
		githubCacheInventoryStatus.set(emptyInventorySummary);
		return;
	}

	const summary = createInventorySummary(await readActiveInventoryRecords());
	githubCacheInventoryStatus.set(summary);
	updateWarmStatusFromInventory(summary);
}

function updateWarmStatusFromInventory(summary = get(githubCacheInventoryStatus)): void {
	if (!summary.totalTargets) {
		updateWarmStatus({
			phase: 'idle',
			message: null,
			totalTasks: 0,
			completedTasks: 0,
			showProgress: false,
			error: null
		});
		return;
	}

	const activeWork =
		summary.missingTargets +
		summary.staleTargets +
		summary.refreshingTargets +
		summary.errorTargets;
	updateWarmStatus({
		phase:
			summary.errorTargets > 0
				? 'error'
				: activeWork > 0
					? summary.refreshingTargets > 0
						? 'warming'
						: 'checking'
					: 'ready',
		message: activeWork > 0 ? 'Caching site data' : 'Site data cached',
		totalTasks: summary.totalTargets,
		completedTasks: summary.cachedTargets + summary.skippedBudgetTargets,
		showProgress: activeWork > 0,
		error: summary.errorTargets > 0 ? 'Some cache targets failed to refresh.' : null
	});
}

function getInventoryWarmProgressFields(summary = get(githubCacheInventoryStatus)) {
	if (summary.totalTargets <= 0) {
		return {
			totalTasks: 0,
			completedTasks: 0,
			showProgress: false
		};
	}

	const activeWork =
		summary.missingTargets +
		summary.staleTargets +
		summary.refreshingTargets +
		summary.errorTargets;
	return {
		totalTasks: summary.totalTargets,
		completedTasks: summary.cachedTargets + summary.skippedBudgetTargets,
		showProgress: activeWork > 0
	};
}

async function buildInventoryFromActiveSnapshot(): Promise<void> {
	const snapshot = getActiveSnapshot();
	if (!browser || !snapshot) {
		githubCacheInventoryStatus.set(emptyInventorySummary);
		return;
	}

	const records = new Map<string, GithubCacheInventoryRecord>();
	const addRecord = (record: GithubCacheInventoryRecord) => records.set(record.targetId, record);

	addRecord(
		createInventoryRecord({
			snapshot,
			targetId: getInventoryTargetId({ targetType: 'snapshot' }),
			targetType: 'snapshot',
			label: 'Repository snapshot',
			status: 'fresh',
			estimatedBytes: getSerializedByteSize(snapshot),
			lastCachedAt: snapshot.updatedAt
		})
	);
	addRecord(
		createInventoryRecord({
			snapshot,
			targetId: getInventoryTargetId({ targetType: 'blockSupport' }),
			targetType: 'blockSupport',
			label: 'Block support',
			status: (await getCachedBlockSupport()) ? 'fresh' : 'missing'
		})
	);

	for (const config of snapshot.configs) {
		if (config.config.collection) {
			const index = await getCachedCollectionIndex(config.slug);
			addRecord(
				createInventoryRecord({
					snapshot,
					targetId: getInventoryTargetId({
						targetType: 'collectionIndex',
						configSlug: config.slug
					}),
					targetType: 'collectionIndex',
					label: config.config.label,
					path: config.path,
					configSlug: config.slug,
					status: index ? 'fresh' : 'missing',
					estimatedBytes: index ? getSerializedByteSize(index) : null,
					lastCachedAt: index?.updatedAt ?? null,
					schemaIdentity: index?.identity.schemaIdentity ?? null,
					dependencyIdentity: index?.identity.contentIdentity ?? config.path
				})
			);

			if (!index) {
				continue;
			}

			for (const item of index.items) {
				const projection = await readStore<CachedProjection>(
					PROJECTION_STORE,
					getProjectionKey({
						repoFullName: snapshot.repoFullName,
						blobSha: item.blobSha,
						schemaIdentity: index.identity.schemaIdentity
					})
				);
				const document = await readStore<CachedDocument>(
					DOCUMENT_STORE,
					getDocumentKey({
						repoFullName: snapshot.repoFullName,
						blobSha: item.blobSha,
						configSlug: index.configSlug
					})
				);
				const itemId = item.hrefItemId ?? item.itemId;
				addRecord(
					createInventoryRecord({
						snapshot,
						targetId: getInventoryTargetId({
							targetType: 'collectionProjection',
							configSlug: index.configSlug,
							itemId
						}),
						targetType: 'collectionProjection',
						label: item.title || item.filename,
						path: item.path,
						configSlug: index.configSlug,
						itemId,
						blobSha: item.blobSha,
						schemaIdentity: index.identity.schemaIdentity,
						status: projection ? 'fresh' : 'missing',
						estimatedBytes: projection ? getSerializedByteSize(projection) : null,
						lastCachedAt: projection?.updatedAt ?? null
					})
				);
				addRecord(
					createInventoryRecord({
						snapshot,
						targetId: getInventoryTargetId({
							targetType: 'itemDocument',
							configSlug: index.configSlug,
							itemId
						}),
						targetType: 'itemDocument',
						label: item.title || item.filename,
						path: item.path,
						configSlug: index.configSlug,
						itemId,
						blobSha: item.blobSha,
						schemaIdentity: index.identity.schemaIdentity,
						status: document ? 'fresh' : 'missing',
						estimatedBytes: document ? getSerializedByteSize(document.content) : null,
						lastCachedAt: document?.updatedAt ?? null
					})
				);
			}
			continue;
		}

		const singleton = await readStore<CachedSingletonDocument>(
			SINGLETON_DOCUMENT_STORE,
			getSingletonDocumentKey(snapshot, config.slug)
		);
		const contentIdentity = getSingletonContentIdentity(snapshot, config.slug);
		addRecord(
			createInventoryRecord({
				snapshot,
				targetId: getInventoryTargetId({
					targetType: 'singletonDocument',
					configSlug: config.slug
				}),
				targetType: 'singletonDocument',
				label: config.config.label,
				path: contentIdentity?.path ?? getSingletonContentPath(config),
				configSlug: config.slug,
				blobSha: contentIdentity?.blobSha ?? singleton?.blobSha ?? null,
				status: singleton ? 'fresh' : 'missing',
				estimatedBytes: singleton ? getSerializedByteSize(singleton.content) : null,
				lastCachedAt: singleton?.updatedAt ?? null,
				dependencyIdentity: contentIdentity?.blobSha ?? null
			})
		);
	}

	const existing = await readActiveInventoryRecords();
	let documentCount = 0;
	let documentBytes = 0;
	for (const record of records.values()) {
		if (record.targetType !== 'itemDocument') {
			continue;
		}

		documentCount += 1;
		documentBytes += record.estimatedBytes ?? 0;
		if (
			documentCount > fullDocumentBudgetPolicy.recordLimit ||
			documentBytes > fullDocumentBudgetPolicy.bytes
		) {
			record.status = 'skipped-budget';
		}
	}
	await Promise.all(
		existing
			.filter((record) => !records.has(record.targetId))
			.map((record) => deleteStoreRecord(INVENTORY_STORE, record.key))
	);
	await Promise.all([...records.values()].map((record) => upsertInventoryRecord(record)));
	await refreshInventoryStatus();
}

function getSnapshotKey(repoFullName: string, ref: string): string {
	return `${repoFullName}:${ref}`;
}

function getSnapshotIdentityKey(snapshot: CachedSnapshot): string {
	return [
		snapshot.repoFullName,
		snapshot.identity.ref,
		snapshot.identity.headSha,
		snapshot.identity.treeSha
	].join(':');
}

function getWorkspaceKey(snapshot: CachedSnapshot): string {
	return [
		snapshot.repoFullName,
		snapshot.ref,
		snapshot.identity.headSha,
		snapshot.identity.treeSha
	].join(':');
}

function getInventoryKey(targetId: string): string {
	const snapshot = getActiveSnapshot();
	return `${snapshot ? getWorkspaceKey(snapshot) : 'inactive'}:${targetId}`;
}

function getInventoryTargetId(input: {
	targetType: GithubCacheInventoryTargetType;
	configSlug?: string | null;
	itemId?: string | null;
	blobSha?: string | null;
}): string {
	if (input.targetType === 'snapshot' || input.targetType === 'blockSupport') {
		return input.targetType;
	}

	if (input.targetType === 'collectionProjection' || input.targetType === 'itemDocument') {
		return [
			input.targetType,
			input.configSlug ?? 'unknown',
			input.itemId ?? input.blobSha ?? 'unknown'
		].join(':');
	}

	return [input.targetType, input.configSlug ?? 'unknown'].join(':');
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

function getSingletonContentIdentity(
	snapshot: CachedSnapshot,
	slug: string
): RepoSingletonContentIdentity | null {
	return snapshot.singletonContentIdentities[slug] ?? null;
}

function getSingletonDocumentKey(snapshot: CachedSnapshot, slug: string): string {
	const contentIdentity = getSingletonContentIdentity(snapshot, slug);
	if (contentIdentity) {
		return `${snapshot.repoFullName}:${contentIdentity.blobSha}:${slug}`;
	}

	return getLegacySingletonDocumentKey(snapshot, slug);
}

function getLegacySingletonDocumentKey(snapshot: CachedSnapshot, slug: string): string {
	return `${snapshot.repoFullName}:${snapshot.identity.ref}:${snapshot.identity.treeSha}:${slug}`;
}

function getBlockSupportKey(input: { repoFullName: string; ref: string; treeSha: string }): string {
	return `${input.repoFullName}:${input.ref}:${input.treeSha}`;
}

function getSerializedByteSize(value: unknown): number | null {
	try {
		return new Blob([JSON.stringify(value)]).size;
	} catch {
		return null;
	}
}

function getRecordStatusClass(status: GithubCacheInventoryStatus): number {
	if (status === 'refreshing') {
		return 0;
	}
	if (status === 'error') {
		return 1;
	}
	if (status === 'stale' || status === 'missing') {
		return 2;
	}
	if (status === 'skipped-budget') {
		return 3;
	}
	return 4;
}

function getPriorityValue(priority: CacheTaskPriority): number {
	if (priority === 'foreground') {
		return 300;
	}

	if (priority === 'intent') {
		return 200;
	}

	if (priority === 'topLevel') {
		return 100;
	}

	return 0;
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

function createEmptyTaskKindDebug(): GithubCacheTaskKindDebug {
	return {
		total: 0,
		completed: 0,
		error: 0,
		queued: 0,
		running: 0
	};
}

function getTaskKindDebugCounts(): Record<CacheTaskKind, GithubCacheTaskKindDebug> {
	const taskKinds: CacheTaskKind[] = [
		'blockRegistry',
		'singletonDocument',
		'collectionIndex',
		'collectionProjectionBatch',
		'itemDocument'
	];
	const counts = Object.fromEntries(
		taskKinds.map((kind) => [kind, createEmptyTaskKindDebug()])
	) as Record<CacheTaskKind, GithubCacheTaskKindDebug>;

	for (const kind of taskKinds) {
		counts[kind].total = totalQueuedTasksByKind.get(kind) ?? 0;
		counts[kind].completed = completedQueuedTasksByKind.get(kind) ?? 0;
		counts[kind].error = erroredQueuedTasksByKind.get(kind) ?? 0;
	}

	for (const task of cacheTasks.values()) {
		if (task.status === 'queued') {
			counts[task.kind].queued += 1;
		} else if (task.status === 'running') {
			counts[task.kind].running += 1;
		}
	}

	return counts;
}

function createWarmDebugStatus(status: GithubCacheWarmStatus): GithubCacheWarmDebugStatus {
	const queuedTasks = [...cacheTasks.values()].filter((task) => task.status === 'queued');
	const runningTasks = [...cacheTasks.values()].filter((task) => task.status === 'running');
	return {
		...status,
		activeRepoFullName: activeSnapshot?.repoFullName ?? null,
		activeRef: activeSnapshot?.identity.ref ?? null,
		activeTreeSha: activeSnapshot?.identity.treeSha ?? null,
		activeIdentityKey: activeSnapshotIdentityKey,
		queuedTasks: queuedTasks.length,
		runningTasks: runningTasks.length,
		doneTasks: completedQueuedTasks,
		errorTasks: erroredQueuedTasks,
		pendingTaskKinds: Array.from(new Set(queuedTasks.map((task) => task.kind))),
		pendingTaskKeys: queuedTasks.map((task) => task.key),
		runningTaskKind: runningTask?.kind ?? runningTasks[0]?.kind ?? null,
		taskKinds: getTaskKindDebugCounts()
	};
}

function syncWarmDebugStatus() {
	githubCacheWarmDebugStatus.set(createWarmDebugStatus(get(githubCacheWarmStatus)));
}

function incrementTaskKindCount(counts: Map<CacheTaskKind, number>, kind: CacheTaskKind) {
	counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

function resetTaskCounters() {
	totalQueuedTasks = 0;
	completedQueuedTasks = 0;
	erroredQueuedTasks = 0;
	totalQueuedTasksByKind.clear();
	completedQueuedTasksByKind.clear();
	erroredQueuedTasksByKind.clear();
}

function clearWarmReadyResetTimer() {
	if (!warmReadyResetTimer) {
		return;
	}

	clearTimeout(warmReadyResetTimer);
	warmReadyResetTimer = null;
}

function clearWarmProgressRevealTimer() {
	if (!warmProgressRevealTimer) {
		return;
	}

	clearTimeout(warmProgressRevealTimer);
	warmProgressRevealTimer = null;
}

function clearFreshnessTimer() {
	if (!freshnessTimer) {
		return;
	}

	clearTimeout(freshnessTimer);
	freshnessTimer = null;
}

function resetFreshnessBackoff() {
	freshnessBackoffIndex = 0;
}

function hasSameRepositoryIdentity(
	current: RepoBootstrapIdentity | null | undefined,
	next: RepoBootstrapIdentity | null | undefined
): boolean {
	return (
		current?.repoKey === next?.repoKey &&
		current?.ref === next?.ref &&
		current?.headSha === next?.headSha &&
		current?.treeSha === next?.treeSha
	);
}

function extractChangedPaths(bootstrap: FreshnessBootstrap): string[] {
	return Array.isArray(bootstrap.changedPaths)
		? bootstrap.changedPaths.filter(
				(path): path is string => typeof path === 'string' && path.length > 0
			)
		: [];
}

function resetWarmStatus() {
	clearWarmReadyResetTimer();
	clearWarmProgressRevealTimer();
	resetTaskCounters();
	githubCacheWarmStatus.set({
		phase: 'idle',
		message: null,
		currentCollectionSlug: null,
		totalCollections: 0,
		warmedCollections: 0,
		totalItems: 0,
		hydratedItems: 0,
		totalTasks: 0,
		completedTasks: 0,
		showProgress: false,
		error: null
	});
	syncWarmDebugStatus();
}

function updateWarmStatus(nextStatus: Partial<GithubCacheWarmStatus>) {
	clearWarmReadyResetTimer();
	githubCacheWarmStatus.update((status) => ({
		...status,
		...nextStatus
	}));
	syncWarmDebugStatus();
}

function updateQueueProgress(nextStatus: Partial<GithubCacheWarmStatus> = {}) {
	const inventorySummary = get(githubCacheInventoryStatus);
	if (inventorySummary.totalTargets > 0) {
		updateWarmStatusFromInventory(inventorySummary);
		return;
	}

	const shouldShowProgress =
		totalQueuedTasks >= CACHE_PROGRESS_LARGE_TASK_THRESHOLD ||
		get(githubCacheWarmStatus).showProgress;
	updateWarmStatus({
		phase: totalQueuedTasks > completedQueuedTasks ? 'warming' : 'ready',
		totalTasks: totalQueuedTasks,
		completedTasks: completedQueuedTasks,
		showProgress: shouldShowProgress,
		...nextStatus
	});
}

function scheduleSlowProgressReveal() {
	clearWarmProgressRevealTimer();
	warmProgressRevealTimer = setTimeout(() => {
		warmProgressRevealTimer = null;
		if (totalQueuedTasks > completedQueuedTasks) {
			updateWarmStatus({ showProgress: true });
		}
	}, CACHE_PROGRESS_SLOW_JOB_MS);
}

function markWarmReady(totalCollections: number, totalItems: number) {
	clearWarmProgressRevealTimer();
	githubCacheWarmStatus.set({
		phase: 'ready',
		message: 'Site data cached',
		currentCollectionSlug: null,
		totalCollections,
		warmedCollections: totalCollections,
		totalItems,
		hydratedItems: totalItems,
		totalTasks: totalQueuedTasks,
		completedTasks: totalQueuedTasks,
		showProgress: false,
		error: null
	});
	syncWarmDebugStatus();
	clearWarmReadyResetTimer();
	warmReadyResetTimer = setTimeout(() => {
		warmReadyResetTimer = null;
		resetWarmStatus();
	}, SITE_WARM_READY_RESET_MS);
}

function markWarmError(error: unknown) {
	updateWarmStatus({
		phase: 'error',
		message: 'Cache warm paused',
		currentCollectionSlug: null,
		error: error instanceof Error ? error.message : 'Failed to warm repository cache'
	});
}

function cancelActiveSiteWarm() {
	siteWarmRunId += 1;
	cacheTasks.clear();
	runningTask = null;
	queueScheduled = false;
	resetWarmStatus();
}

function isRunCurrent(runId: number): boolean {
	return runId === siteWarmRunId;
}

async function waitForIdle(runId: number): Promise<boolean> {
	if (!browser || !isRunCurrent(runId)) {
		return false;
	}

	await new Promise<void>((resolve) => {
		const idleWindow = window as unknown as IdleWindow;
		if (typeof idleWindow.requestIdleCallback === 'function') {
			const idleCallback = idleWindow.requestIdleCallback(
				() => {
					resolve();
				},
				{ timeout: 1200 }
			);
			if (!isRunCurrent(runId)) {
				idleWindow.cancelIdleCallback?.(idleCallback);
				resolve();
			}
			return;
		}

		window.setTimeout(resolve, 80);
	});

	return isRunCurrent(runId);
}

function getNextTask(): CacheTask | null {
	const queuedTasks = [...cacheTasks.values()].filter((task) => task.status === 'queued');
	queuedTasks.sort((a, b) => b.priority - a.priority || a.order - b.order);
	return queuedTasks[0] ?? null;
}

function scheduleQueueRun(runId: number) {
	if (queueScheduled || runningTask || !isRunCurrent(runId)) {
		return;
	}

	queueScheduled = true;
	queueMicrotask(() => {
		queueScheduled = false;
		void runQueue(runId);
	});
}

async function runQueue(runId: number): Promise<void> {
	if (runningTask || !isRunCurrent(runId)) {
		return;
	}

	const task = getNextTask();
	if (!task) {
		return;
	}

	if (task.passive && !(await waitForIdle(runId))) {
		return;
	}

	task.status = 'running';
	runningTask = task;
	syncWarmDebugStatus();
	updateQueueProgress({
		phase: 'warming',
		message: 'Caching site data',
		error: null
	});

	try {
		const result = await task.run();
		task.status = 'done';
		if (isRunCurrent(runId)) {
			completedQueuedTasks += 1;
			incrementTaskKindCount(completedQueuedTasksByKind, task.kind);
		}
		task.resolve(result);
	} catch (error) {
		task.status = 'error';
		await updateInventoryTarget(task.key, {
			status: 'error',
			error: error instanceof Error ? error.message : 'Failed to refresh cache target',
			lastCheckedAt: Date.now()
		});
		task.reject(error);
		if (isRunCurrent(runId)) {
			erroredQueuedTasks += 1;
			incrementTaskKindCount(erroredQueuedTasksByKind, task.kind);
			markWarmError(error);
		}
	} finally {
		cacheTasks.delete(task.key);
		if (runningTask === task) {
			runningTask = null;
		}
		if (isRunCurrent(runId)) {
			updateQueueProgress();
			scheduleQueueRun(runId);
		}
	}
}

function enqueueCacheTask<T>(input: {
	runId: number;
	key: string;
	kind: CacheTaskKind;
	priority: CacheTaskPriority;
	passive?: boolean;
	run: () => Promise<T>;
}): Promise<T> {
	const nextPriority = getPriorityValue(input.priority);
	const existing = cacheTasks.get(input.key) as CacheTask<T> | undefined;
	if (existing) {
		existing.priority = Math.max(existing.priority, nextPriority);
		existing.passive = existing.passive && input.priority === 'passive';
		scheduleQueueRun(input.runId);
		return existing.promise;
	}

	let resolveTask!: (value: T) => void;
	let rejectTask!: (error: unknown) => void;
	const promise = new Promise<T>((resolve, reject) => {
		resolveTask = resolve;
		rejectTask = reject;
	});
	const task: CacheTask<T> = {
		key: input.key,
		kind: input.kind,
		priority: nextPriority,
		passive: input.passive ?? input.priority === 'passive',
		order: taskOrder++,
		status: 'queued',
		run: input.run,
		promise,
		resolve: resolveTask,
		reject: rejectTask
	};

	cacheTasks.set(input.key, task as CacheTask<unknown>);
	void updateInventoryTarget(input.key, {
		status: 'refreshing',
		error: null,
		lastCheckedAt: Date.now()
	}).catch(() => {});
	totalQueuedTasks += 1;
	incrementTaskKindCount(totalQueuedTasksByKind, input.kind);
	if (totalQueuedTasks === 1) {
		scheduleSlowProgressReveal();
	}
	updateQueueProgress({
		phase: 'checking',
		message: 'Caching site data',
		error: null
	});
	scheduleQueueRun(input.runId);
	return promise;
}

function getConfig(snapshot: CachedSnapshot, slug: string): DiscoveredConfig | null {
	return snapshot.configs.find((config) => config.slug === slug) ?? null;
}

function getSingletonContentPath(config: DiscoveredConfig): string | null {
	if (config.config.collection || config.config.content.mode !== 'file') {
		return null;
	}

	const configuredPath = config.config.content.path;
	if (!configuredPath) {
		return null;
	}

	const configDirectory = config.path.split('/').slice(0, -1).join('/');
	const combined = configuredPath.startsWith('/')
		? configuredPath.slice(1)
		: `${configDirectory}/${configuredPath}`;
	const normalizedParts: string[] = [];
	for (const part of combined.split('/')) {
		if (!part || part === '.') {
			continue;
		}
		if (part === '..') {
			normalizedParts.pop();
			continue;
		}
		normalizedParts.push(part);
	}

	return normalizedParts.join('/');
}

async function getCachedBlockSupport(): Promise<CachedBlockSupport | null> {
	const snapshot = getActiveSnapshot();
	if (!snapshot) {
		return null;
	}

	return await readStore<CachedBlockSupport>(
		BLOCK_SUPPORT_STORE,
		getBlockSupportKey({
			repoFullName: snapshot.repoFullName,
			ref: snapshot.identity.ref,
			treeSha: snapshot.identity.treeSha
		})
	);
}

async function writeBlockSupport(input: {
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
}): Promise<void> {
	const snapshot = getActiveSnapshot();
	if (!snapshot) {
		return;
	}

	const record: CachedBlockSupport = {
		key: getBlockSupportKey({
			repoFullName: snapshot.repoFullName,
			ref: snapshot.identity.ref,
			treeSha: snapshot.identity.treeSha
		}),
		repoFullName: snapshot.repoFullName,
		ref: snapshot.identity.ref,
		treeSha: snapshot.identity.treeSha,
		blockConfigs: input.blockConfigs,
		packageBlocks: input.packageBlocks,
		blockRegistryError: input.blockRegistryError,
		updatedAt: Date.now()
	};
	await writeStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE, record);
	await updateInventoryTarget(getInventoryTargetId({ targetType: 'blockSupport' }), {
		status: 'fresh',
		lastCachedAt: record.updatedAt,
		estimatedBytes: getSerializedByteSize(record),
		error: input.blockRegistryError
	});
}

async function getCachedCollectionIndex(slug: string): Promise<SerializableCollectionIndex | null> {
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
	const record: SerializableCollectionIndex = {
		...index,
		key: getCollectionIndexKey(index.identity),
		updatedAt: Date.now()
	};
	await writeStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE, record);
	await updateInventoryTarget(
		getInventoryTargetId({ targetType: 'collectionIndex', configSlug: index.configSlug }),
		{
			status: 'fresh',
			lastCachedAt: record.updatedAt,
			estimatedBytes: getSerializedByteSize(record),
			schemaIdentity: index.identity.schemaIdentity
		}
	);
	await buildInventoryFromActiveSnapshot();
}

async function writeProjectionItems(
	repoFullName: string,
	configSlug: string,
	schemaIdentity: string,
	items: CollectionIndexItem[]
): Promise<void> {
	await Promise.all(
		items.map(async (item) => {
			const record: CachedProjection = {
				key: getProjectionKey({ repoFullName, blobSha: item.blobSha, schemaIdentity }),
				repoFullName,
				blobSha: item.blobSha,
				schemaIdentity,
				item,
				updatedAt: Date.now()
			};
			await writeStore<CachedProjection>(PROJECTION_STORE, record);
			await updateInventoryTarget(
				getInventoryTargetId({
					targetType: 'collectionProjection',
					configSlug,
					itemId: item.hrefItemId ?? item.itemId ?? item.blobSha
				}),
				{
					status: 'fresh',
					lastCachedAt: record.updatedAt,
					estimatedBytes: getSerializedByteSize(record),
					blobSha: item.blobSha,
					path: item.path
				}
			);
		})
	);
}

async function getMissingProjectionBlobShas(
	index: SerializableCollectionIndex,
	snapshot: CachedSnapshot
): Promise<string[]> {
	const missingBlobShas = await Promise.all(
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
	);

	return missingBlobShas.filter((blobSha): blobSha is string => typeof blobSha === 'string');
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

function isNavigationPath(path: string): boolean {
	return path === 'tentman.json' || path === 'tentman/navigation-manifest.json';
}

function isBlockSupportPath(path: string): boolean {
	return path.includes('/blocks/') || path.endsWith('/blocks.tentman.json');
}

function getConfigPathsBySlug(snapshot: CachedSnapshot | null): Map<string, string> {
	return new Map(snapshot?.configs.map((config) => [config.slug, config.path]) ?? []);
}

function getBlockConfigPaths(snapshot: CachedSnapshot | null): Set<string> {
	return new Set(snapshot?.blockConfigs.map((config) => config.path) ?? []);
}

function pathMatchesConfigSlug(
	path: string,
	record: GithubCacheInventoryRecord,
	configPathsBySlug: Map<string, string>
): boolean {
	if (!record.configSlug) {
		return false;
	}

	const exactPath = configPathsBySlug.get(record.configSlug);
	return exactPath ? path === exactPath : path.endsWith(`${record.configSlug}.tentman.json`);
}

function isPathInCollectionIdentityPath(path: string, dependencyIdentity: string | null): boolean {
	const [contentPath] = dependencyIdentity?.split(':') ?? [];
	if (!contentPath) {
		return false;
	}

	return path === contentPath || path.startsWith(`${contentPath}/`);
}

function recordMatchesChangedPath(
	record: GithubCacheInventoryRecord,
	changedPaths: Set<string>,
	snapshot: CachedSnapshot | null
): boolean {
	if (record.path && changedPaths.has(record.path)) {
		return true;
	}

	const changedPathList = [...changedPaths];
	const configPathsBySlug = getConfigPathsBySlug(snapshot);
	if (record.targetType === 'snapshot') {
		return changedPathList.some(isNavigationPath);
	}

	if (record.targetType === 'blockSupport') {
		const blockConfigPaths = getBlockConfigPaths(snapshot);
		return changedPathList.some((path) => isBlockSupportPath(path) || blockConfigPaths.has(path));
	}

	if (record.targetType === 'collectionIndex') {
		return changedPathList.some(
			(path) =>
				pathMatchesConfigSlug(path, record, configPathsBySlug) ||
				isPathInCollectionIdentityPath(path, record.dependencyIdentity)
		);
	}

	if (
		record.targetType === 'collectionProjection' ||
		record.targetType === 'itemDocument' ||
		record.targetType === 'singletonDocument'
	) {
		return changedPathList.some((path) => pathMatchesConfigSlug(path, record, configPathsBySlug));
	}

	return false;
}

async function markInventoryTargetsStaleForPaths(changedPaths: string[]): Promise<void> {
	const changedPathSet = new Set(changedPaths);
	const snapshot = getActiveSnapshot();
	const records = await readActiveInventoryRecords();
	const staleRecords = records.filter((record) =>
		recordMatchesChangedPath(record, changedPathSet, snapshot)
	);

	await updateInventoryRecords(staleRecords, {
		status: 'stale',
		error: null,
		lastCheckedAt: Date.now()
	});
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
		input.slug,
		result.indexIdentity.schemaIdentity,
		result.items
	);
	await notifyCollection(input.slug);
}

async function getCachedItemDocumentForIndexItem(
	snapshot: CachedSnapshot,
	slug: string,
	item: CollectionIndexItem
): Promise<CachedItemDocumentResult | null> {
	const content = await githubRepositoryCache.getItemDocument({
		repoFullName: snapshot.repoFullName,
		blobSha: item.blobSha,
		configSlug: slug
	});
	return content ? { content, indexItem: item } : null;
}

async function enqueueItemDocumentTask(input: {
	runId: number;
	slug: string;
	itemId: string;
	indexItem: CollectionIndexItem;
	fetcher: typeof fetch;
	priority: CacheTaskPriority;
}): Promise<CachedItemDocumentResult | null> {
	const snapshot = getActiveSnapshot();
	if (!snapshot) {
		return null;
	}

	const targetId = getInventoryTargetId({
		targetType: 'itemDocument',
		configSlug: input.slug,
		itemId: input.itemId
	});
	const inventoryRecord = await readStore<GithubCacheInventoryRecord>(
		INVENTORY_STORE,
		getInventoryKey(targetId)
	);
	if (
		inventoryRecord?.status === 'skipped-budget' &&
		input.priority !== 'foreground' &&
		input.priority !== 'intent'
	) {
		return null;
	}

	const cached = await getCachedItemDocumentForIndexItem(snapshot, input.slug, input.indexItem);
	if (cached) {
		return cached;
	}

	await enqueueCacheTask({
		runId: input.runId,
		key: targetId,
		kind: 'itemDocument',
		priority: input.priority,
		passive: input.priority === 'passive',
		run: async () => {
			const response = await input.fetcher(
				`/api/repo/item-view?slug=${encodeURIComponent(input.slug)}&itemId=${encodeURIComponent(input.itemId)}`
			);
			if (!response.ok) {
				throw new Error(`Failed to load item document (${response.status})`);
			}

			const data = (await response.json()) as {
				item?: ContentRecord | null;
				blockConfigs?: DiscoveredBlockConfig[];
				packageBlocks?: SerializablePackageBlock[];
				blockRegistryError?: string | null;
				redirectTo?: string;
			};
			if (data.redirectTo) {
				return;
			}
			await writeBlockSupport({
				blockConfigs: data.blockConfigs ?? getActiveSnapshot()?.blockConfigs ?? [],
				packageBlocks: data.packageBlocks ?? [],
				blockRegistryError: data.blockRegistryError ?? null
			});
			await githubRepositoryCache.setItemDocumentForRoute({
				slug: input.slug,
				itemId: input.itemId,
				content: data.item ?? null
			});
		}
	});

	return await githubRepositoryCache.getItemDocumentForRoute({
		slug: input.slug,
		itemId: input.itemId
	});
}

export const githubRepositoryCache = {
	async hydrateFromBootstrap(input: {
		repoFullName: string;
		bootstrap: RepoConfigsBootstrap;
	}): Promise<void> {
		if (!browser || !input.bootstrap.repositoryIdentity) {
			activeSnapshot = null;
			activeSnapshotIdentityKey = null;
			githubCacheInventoryStatus.set(emptyInventorySummary);
			cancelActiveSiteWarm();
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
			singletonContentIdentities: input.bootstrap.singletonContentIdentities ?? {},
			activeDraftBranch: input.bootstrap.activeDraftBranch,
			mainRepositoryIdentity:
				input.bootstrap.mainRepositoryIdentity ??
				(input.bootstrap.activeDraftBranch ? null : input.bootstrap.repositoryIdentity),
			draftRepositoryIdentity:
				input.bootstrap.draftRepositoryIdentity ??
				(input.bootstrap.activeDraftBranch ? input.bootstrap.repositoryIdentity : null),
			updatedAt: Date.now()
		};
		const nextIdentityKey = getSnapshotIdentityKey(snapshot);
		if (activeSnapshotIdentityKey && activeSnapshotIdentityKey !== nextIdentityKey) {
			cancelActiveSiteWarm();
		}
		activeSnapshot = snapshot;
		activeSnapshotIdentityKey = nextIdentityKey;
		syncWarmDebugStatus();
		await writeStore(SNAPSHOT_STORE, snapshot);
		await buildInventoryFromActiveSnapshot();
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
			items.map(({ itemId, title, sortDate, sortValues, state, hydration, hrefItemId }) => ({
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
	},

	async ensureCollectionIndex(
		slug: string,
		options: {
			fetcher: typeof fetch;
			force?: boolean;
			priority?: CacheTaskPriority;
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

		const runId = siteWarmRunId;
		await enqueueCacheTask({
			runId,
			key: getInventoryTargetId({ targetType: 'collectionIndex', configSlug: slug }),
			kind: 'collectionIndex',
			priority: options.priority ?? 'foreground',
			passive: (options.priority ?? 'foreground') === 'passive',
			run: async () => {
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
			}
		});
	},

	async warmCollection(
		slug: string,
		options: {
			fetcher: typeof fetch;
			visibleLimit?: number;
			force?: boolean;
			waitForBackground?: boolean;
			priority?: CacheTaskPriority;
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

		void githubRepositoryCache
			.warmCollectionDocuments(slug, {
				fetcher: options.fetcher,
				priority: options.priority ?? 'passive'
			})
			.catch(() => {});

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return;
		}

		const missingBlobShas = await getMissingProjectionBlobShas(index, snapshot);

		const visibleLimit = options.visibleLimit ?? VISIBLE_PROJECTION_LIMIT;
		const visibleBlobShas = missingBlobShas.slice(0, visibleLimit);
		await hydrateProjectionBatch({
			fetcher: options.fetcher,
			slug,
			blobShas: visibleBlobShas
		});

		const remainingBlobShas = missingBlobShas.slice(visibleLimit);
		const hydrateRemaining = async () => {
			for (
				let index = 0;
				index < remainingBlobShas.length;
				index += BACKGROUND_PROJECTION_BATCH_SIZE
			) {
				await hydrateProjectionBatch({
					fetcher: options.fetcher,
					slug,
					blobShas: remainingBlobShas.slice(index, index + BACKGROUND_PROJECTION_BATCH_SIZE)
				});
			}
		};

		if (options.waitForBackground) {
			await hydrateRemaining();
			return;
		}

		void hydrateRemaining().catch((error) => {
			console.error(`Failed to hydrate background projections for ${slug}:`, error);
		});
	},

	async warmCollectionDocuments(
		slug: string,
		options: {
			fetcher: typeof fetch;
			priority?: CacheTaskPriority;
			promotedItemId?: string | null;
			promotedPriority?: CacheTaskPriority;
			waitForBackground?: boolean;
		}
	): Promise<void> {
		if (!browser || !getActiveSnapshot()) {
			return;
		}

		let index = await getCachedCollectionIndex(slug);
		if (!index) {
			await githubRepositoryCache.ensureCollectionIndex(slug, {
				fetcher: options.fetcher,
				priority: options.priority ?? 'passive'
			});
			index = await getCachedCollectionIndex(slug);
		}
		if (!index) {
			return;
		}

		const promotedItem = options.promotedItemId
			? index.items.find((item) => isMatchingCollectionIndexItem(item, options.promotedItemId!))
			: null;
		const orderedItems = promotedItem
			? [promotedItem, ...index.items.filter((item) => item !== promotedItem)]
			: index.items;
		const tasks = orderedItems.map((item) => {
			const itemId = item.hrefItemId ?? item.itemId;
			const isPromoted =
				options.promotedItemId !== undefined &&
				options.promotedItemId !== null &&
				isMatchingCollectionIndexItem(item, options.promotedItemId);
			return enqueueItemDocumentTask({
				runId: siteWarmRunId,
				slug,
				itemId,
				indexItem: item,
				fetcher: options.fetcher,
				priority: isPromoted
					? (options.promotedPriority ?? options.priority ?? 'intent')
					: (options.priority ?? 'passive')
			});
		});

		if (options.waitForBackground) {
			await Promise.all(tasks);
			return;
		}

		for (const task of tasks) {
			void task.catch(() => {});
		}
	},

	async getSingletonDocumentForRoute(input: {
		slug: string;
	}): Promise<CachedSingletonDocumentResult | null> {
		if (!browser) {
			return null;
		}

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return null;
		}

		const cached =
			(await readStore<CachedSingletonDocument>(
				SINGLETON_DOCUMENT_STORE,
				getSingletonDocumentKey(snapshot, input.slug)
			)) ??
			(await readStore<CachedSingletonDocument>(
				SINGLETON_DOCUMENT_STORE,
				getLegacySingletonDocumentKey(snapshot, input.slug)
			));
		if (!cached) {
			return null;
		}

		return {
			content: cached.content,
			blockSupport: await getCachedBlockSupport()
		};
	},

	async setSingletonPageView(input: {
		slug: string;
		content: ContentRecord | null;
		blockConfigs?: DiscoveredBlockConfig[];
		packageBlocks?: SerializablePackageBlock[];
		blockRegistryError?: string | null;
	}): Promise<void> {
		if (!browser) {
			return;
		}

		const snapshot = getActiveSnapshot();
		const config = snapshot ? getConfig(snapshot, input.slug) : null;
		const contentIdentity = snapshot ? getSingletonContentIdentity(snapshot, input.slug) : null;
		const path = contentIdentity?.path ?? (config ? getSingletonContentPath(config) : null);
		if (!snapshot) {
			return;
		}

		if (input.blockConfigs || input.packageBlocks || input.blockRegistryError !== undefined) {
			await writeBlockSupport({
				blockConfigs: input.blockConfigs ?? snapshot.blockConfigs,
				packageBlocks: input.packageBlocks ?? [],
				blockRegistryError: input.blockRegistryError ?? null
			});
		}

		if (!input.content || !path) {
			return;
		}

		const record: CachedSingletonDocument = {
			key: getSingletonDocumentKey(snapshot, input.slug),
			repoFullName: snapshot.repoFullName,
			ref: snapshot.identity.ref,
			treeSha: snapshot.identity.treeSha,
			configSlug: input.slug,
			blobSha: contentIdentity?.blobSha ?? null,
			path,
			content: input.content,
			updatedAt: Date.now()
		};
		await writeStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE, record);
		await updateInventoryTarget(
			getInventoryTargetId({ targetType: 'singletonDocument', configSlug: input.slug }),
			{
				status: 'fresh',
				lastCachedAt: record.updatedAt,
				estimatedBytes: getSerializedByteSize(record.content),
				blobSha: record.blobSha ?? null,
				path
			}
		);
	},

	async warmBlockSupport(options: {
		fetcher: typeof fetch;
		priority?: CacheTaskPriority;
	}): Promise<CachedBlockSupport | null> {
		if (!browser) {
			return null;
		}

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return null;
		}

		const cached = await getCachedBlockSupport();
		if (cached) {
			return cached;
		}

		const slug = snapshot.configs[0]?.slug;
		if (!slug) {
			await writeBlockSupport({
				blockConfigs: snapshot.blockConfigs,
				packageBlocks: [],
				blockRegistryError: null
			});
			return await getCachedBlockSupport();
		}

		await enqueueCacheTask({
			runId: siteWarmRunId,
			key: getInventoryTargetId({ targetType: 'blockSupport' }),
			kind: 'blockRegistry',
			priority: options.priority ?? 'topLevel',
			passive: (options.priority ?? 'topLevel') === 'passive',
			run: async () => {
				const response = await options.fetcher(
					`/api/repo/form-config?slug=${encodeURIComponent(slug)}`
				);
				if (!response.ok) {
					throw new Error(`Failed to load block support (${response.status})`);
				}

				const data = (await response.json()) as {
					blockConfigs?: DiscoveredBlockConfig[];
					packageBlocks?: SerializablePackageBlock[];
					blockRegistryError?: string | null;
				};
				await writeBlockSupport({
					blockConfigs: data.blockConfigs ?? snapshot.blockConfigs,
					packageBlocks: data.packageBlocks ?? [],
					blockRegistryError: data.blockRegistryError ?? null
				});
			}
		});

		return await getCachedBlockSupport();
	},

	async getBlockSupport(): Promise<CachedBlockSupport | null> {
		if (!browser) {
			return null;
		}

		return await getCachedBlockSupport();
	},

	async warmSingletonDocumentRoute(input: {
		slug: string;
		fetcher: typeof fetch;
		priority?: CacheTaskPriority;
	}): Promise<CachedSingletonDocumentResult | null> {
		const cached = await githubRepositoryCache.getSingletonDocumentForRoute({ slug: input.slug });
		if (cached?.blockSupport) {
			return cached;
		}

		const snapshot = getActiveSnapshot();
		if (!browser || !snapshot) {
			return null;
		}

		if (cached && !cached.blockSupport) {
			await githubRepositoryCache.warmBlockSupport({
				fetcher: input.fetcher,
				priority: input.priority ?? 'foreground'
			});
			return await githubRepositoryCache.getSingletonDocumentForRoute({ slug: input.slug });
		}

		await enqueueCacheTask({
			runId: siteWarmRunId,
			key: getInventoryTargetId({ targetType: 'singletonDocument', configSlug: input.slug }),
			kind: 'singletonDocument',
			priority: input.priority ?? 'foreground',
			passive: (input.priority ?? 'foreground') === 'passive',
			run: async () => {
				const response = await input.fetcher(
					`/api/repo/page-view?slug=${encodeURIComponent(input.slug)}`
				);
				if (!response.ok) {
					throw new Error(`Failed to load singleton document (${response.status})`);
				}

				const data = (await response.json()) as {
					content?: ContentRecord | null;
					blockConfigs?: DiscoveredBlockConfig[];
					packageBlocks?: SerializablePackageBlock[];
					blockRegistryError?: string | null;
				};
				await githubRepositoryCache.setSingletonPageView({
					slug: input.slug,
					content: data.content ?? null,
					blockConfigs: data.blockConfigs,
					packageBlocks: data.packageBlocks,
					blockRegistryError: data.blockRegistryError ?? null
				});
			}
		});

		return await githubRepositoryCache.getSingletonDocumentForRoute({ slug: input.slug });
	},

	async warmItemDocumentForRoute(input: {
		slug: string;
		itemId: string;
		fetcher: typeof fetch;
		priority?: CacheTaskPriority;
	}): Promise<CachedItemDocumentResult | null> {
		const cached = await githubRepositoryCache.getItemDocumentForRoute({
			slug: input.slug,
			itemId: input.itemId
		});
		const cachedBlockSupport = await getCachedBlockSupport();
		if (cached && cachedBlockSupport) {
			return cached;
		}

		if (!browser || !getActiveSnapshot()) {
			return null;
		}

		if (cached && !cachedBlockSupport) {
			await githubRepositoryCache.warmBlockSupport({
				fetcher: input.fetcher,
				priority: input.priority ?? 'foreground'
			});
			return cached;
		}

		await githubRepositoryCache.ensureCollectionIndex(input.slug, {
			fetcher: input.fetcher,
			priority: input.priority ?? 'foreground'
		});

		await githubRepositoryCache.warmCollectionDocuments(input.slug, {
			fetcher: input.fetcher,
			priority: 'passive',
			promotedItemId: input.itemId,
			promotedPriority: input.priority ?? 'foreground'
		});

		const indexItem = await getCachedCollectionIndexItem(input.slug, input.itemId);
		if (!indexItem) {
			return null;
		}

		return await enqueueItemDocumentTask({
			runId: siteWarmRunId,
			slug: input.slug,
			itemId: input.itemId,
			indexItem,
			fetcher: input.fetcher,
			priority: input.priority ?? 'foreground'
		});
	},

	promoteRoute(input: { slug: string; itemId?: string | null; fetcher: typeof fetch }): void {
		if (!browser || !getActiveSnapshot()) {
			return;
		}

		if (input.itemId) {
			void githubRepositoryCache
				.warmCollectionDocuments(input.slug, {
					fetcher: input.fetcher,
					priority: 'passive',
					promotedItemId: input.itemId,
					promotedPriority: 'intent'
				})
				.catch(() => {});
			void githubRepositoryCache
				.warmItemDocumentForRoute({
					slug: input.slug,
					itemId: input.itemId,
					fetcher: input.fetcher,
					priority: 'intent'
				})
				.catch(() => {});
			return;
		}

		const snapshot = getActiveSnapshot();
		const config = snapshot ? getConfig(snapshot, input.slug) : null;
		if (config?.config.collection) {
			void githubRepositoryCache
				.warmCollection(input.slug, { fetcher: input.fetcher, priority: 'intent' })
				.catch(() => {});
			return;
		}

		void githubRepositoryCache
			.warmSingletonDocumentRoute({
				slug: input.slug,
				fetcher: input.fetcher,
				priority: 'intent'
			})
			.catch(() => {});
	},

	startIdleSiteWarm(options: { fetcher: typeof fetch }): () => void {
		if (!browser || !getActiveSnapshot()) {
			return () => {};
		}

		const runId = siteWarmRunId + 1;
		siteWarmRunId = runId;
		cacheTasks.clear();
		runningTask = null;
		queueScheduled = false;
		resetTaskCounters();

		void (async () => {
			const snapshot = getActiveSnapshot();
			if (!snapshot) {
				return;
			}

			const collectionSlugs = snapshot.configs
				.filter((config) => config.config.collection)
				.map((config) => config.slug);
			const singletonSlugs = snapshot.configs
				.filter((config) => !config.config.collection)
				.map((config) => config.slug);

			updateWarmStatus({
				phase: 'checking',
				message: 'Caching site data',
				totalCollections: collectionSlugs.length,
				warmedCollections: 0,
				totalItems: 0,
				hydratedItems: 0,
				currentCollectionSlug: null,
				...getInventoryWarmProgressFields(),
				error: null
			});

			const topLevelTasks = [
				githubRepositoryCache.warmBlockSupport({
					fetcher: options.fetcher,
					priority: 'topLevel'
				}),
				...singletonSlugs.map((slug) =>
					githubRepositoryCache.warmSingletonDocumentRoute({
						slug,
						fetcher: options.fetcher,
						priority: 'topLevel'
					})
				),
				...collectionSlugs.map((slug) =>
					githubRepositoryCache
						.ensureCollectionIndex(slug, {
							fetcher: options.fetcher,
							priority: 'topLevel'
						})
						.then(() => {
							updateWarmStatus({
								warmedCollections: get(githubCacheWarmStatus).warmedCollections + 1
							});
						})
				)
			];

			await Promise.all(topLevelTasks);
			if (!isRunCurrent(runId)) {
				return;
			}

			const indexes = (
				await Promise.all(collectionSlugs.map((slug) => getCachedCollectionIndex(slug)))
			).filter((index): index is SerializableCollectionIndex => index !== null);
			const totalItems = indexes.reduce((total, index) => total + index.items.length, 0);
			let hydratedItems = 0;

			updateWarmStatus({
				phase: 'warming',
				message: 'Caching site data',
				totalItems,
				hydratedItems,
				currentCollectionSlug: null
			});

			const projectionTasks: Promise<unknown>[] = [];
			for (const index of indexes) {
				const currentSnapshot = getActiveSnapshot();
				if (!currentSnapshot || !isRunCurrent(runId)) {
					return;
				}

				const missingBlobShas = await getMissingProjectionBlobShas(index, currentSnapshot);
				hydratedItems += index.items.length - missingBlobShas.length;
				updateWarmStatus({
					currentCollectionSlug: index.configSlug,
					hydratedItems
				});
				void githubRepositoryCache
					.warmCollectionDocuments(index.configSlug, {
						fetcher: options.fetcher,
						priority: 'passive'
					})
					.catch(() => {});

				for (
					let batchStart = 0;
					batchStart < missingBlobShas.length;
					batchStart += SITE_WARM_PROJECTION_BATCH_SIZE
				) {
					const blobShas = missingBlobShas.slice(
						batchStart,
						batchStart + SITE_WARM_PROJECTION_BATCH_SIZE
					);
					projectionTasks.push(
						enqueueCacheTask({
							runId,
							key: [
								getInventoryTargetId({
									targetType: 'collectionProjection',
									configSlug: index.configSlug,
									itemId: blobShas[0]
								}),
								blobShas.join(',')
							].join(':'),
							kind: 'collectionProjectionBatch',
							priority: 'topLevel',
							passive: true,
							run: async () => {
								await hydrateProjectionBatch({
									fetcher: options.fetcher,
									slug: index.configSlug,
									blobShas
								});
								hydratedItems += blobShas.length;
								updateWarmStatus({
									currentCollectionSlug: index.configSlug,
									hydratedItems
								});
							}
						})
					);
				}
			}

			await Promise.all(projectionTasks);
			if (!isRunCurrent(runId)) {
				return;
			}

			const documentTasks = indexes.map((index) =>
				githubRepositoryCache.warmCollectionDocuments(index.configSlug, {
					fetcher: options.fetcher,
					priority: 'passive',
					waitForBackground: true
				})
			);
			await Promise.all(documentTasks);

			if (isRunCurrent(runId)) {
				markWarmReady(collectionSlugs.length, totalItems);
			}
		})().catch((error) => {
			if (isRunCurrent(runId)) {
				markWarmError(error);
			}
			console.error('Failed to warm GitHub repository cache:', error);
		});

		return () => {
			if (isRunCurrent(runId)) {
				cancelActiveSiteWarm();
			}
		};
	},

	resetFreshnessSchedule(): void {
		resetFreshnessBackoff();
	},

	async checkFreshness(options: { fetcher: typeof fetch; warmChanged?: boolean }): Promise<void> {
		if (!browser || freshnessCheckInFlight) {
			await freshnessCheckInFlight;
			return;
		}

		const snapshot = getActiveSnapshot();
		if (!snapshot) {
			return;
		}

		freshnessCheckInFlight = (async () => {
			const params = new URLSearchParams({
				previousRef: snapshot.identity.ref,
				previousHeadSha: snapshot.identity.headSha,
				previousTreeSha: snapshot.identity.treeSha
			});
			try {
				const response = await options.fetcher(`/api/repo/configs?${params.toString()}`);
				if (!response.ok) {
					throw new Error(`Failed to check repository freshness (${response.status})`);
				}

				const bootstrap = (await response.json()) as FreshnessBootstrap;
				const nextIdentity = bootstrap.repositoryIdentity ?? null;
				const activeIdentityUnchanged = hasSameRepositoryIdentity(snapshot.identity, nextIdentity);
				const mainIdentityUnchanged = snapshot.activeDraftBranch
					? true
					: hasSameRepositoryIdentity(
							snapshot.identity,
							bootstrap.mainRepositoryIdentity ?? nextIdentity
						);
				const draftIdentityUnchanged = snapshot.activeDraftBranch
					? hasSameRepositoryIdentity(
							snapshot.identity,
							bootstrap.draftRepositoryIdentity ?? nextIdentity
						)
					: true;
				const unchanged =
					activeIdentityUnchanged && mainIdentityUnchanged && draftIdentityUnchanged;

				if (unchanged) {
					const records = await readActiveInventoryRecords();
					await updateInventoryRecords(records, {
						lastCheckedAt: Date.now(),
						error: null
					});
					freshnessBackoffIndex = Math.min(
						freshnessBackoffIndex + 1,
						FRESHNESS_BACKOFF_INTERVALS_MS.length - 1
					);
					return;
				}

				resetFreshnessBackoff();
				if (nextIdentity) {
					await githubRepositoryCache.hydrateFromBootstrap({
						repoFullName: snapshot.repoFullName,
						bootstrap
					});
				}

				const changedPaths = extractChangedPaths(bootstrap);
				if (changedPaths.length > 0) {
					await markInventoryTargetsStaleForPaths(changedPaths);
				} else {
					const records = await readActiveInventoryRecords();
					await updateInventoryRecords(
						records.filter((record) => record.targetType !== 'snapshot'),
						{
							status: 'stale',
							error: null,
							lastCheckedAt: Date.now()
						}
					);
				}

				if (options.warmChanged ?? true) {
					githubRepositoryCache.startIdleSiteWarm({ fetcher: options.fetcher });
				}
			} catch (error) {
				const records = await readActiveInventoryRecords();
				await updateInventoryRecords(records, {
					error: error instanceof Error ? error.message : 'Failed to check repository freshness',
					lastCheckedAt: Date.now()
				});
				throw error;
			}
		})().finally(() => {
			freshnessCheckInFlight = null;
		});

		await freshnessCheckInFlight;
	},

	startFreshnessScheduler(options: { fetcher: typeof fetch }): () => void {
		if (!browser || !getActiveSnapshot()) {
			return () => {};
		}

		let stopped = false;
		const scheduleNext = () => {
			clearFreshnessTimer();
			if (stopped || !getActiveSnapshot()) {
				return;
			}
			freshnessTimer = setTimeout(() => {
				freshnessTimer = null;
				void runCheck();
			}, FRESHNESS_BACKOFF_INTERVALS_MS[freshnessBackoffIndex]);
		};
		const runCheck = async () => {
			if (stopped) {
				return;
			}
			try {
				await githubRepositoryCache.checkFreshness({
					fetcher: options.fetcher,
					warmChanged: true
				});
			} catch (error) {
				const records = await readActiveInventoryRecords();
				await updateInventoryRecords(records, {
					error: error instanceof Error ? error.message : 'Failed to check repository freshness',
					lastCheckedAt: Date.now()
				});
			} finally {
				scheduleNext();
			}
		};

		void runCheck();
		return () => {
			stopped = true;
			clearFreshnessTimer();
		};
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

		const snapshot = getActiveSnapshot();
		const record: CachedDocument = {
			key: getDocumentKey(input),
			...input,
			ref: snapshot?.identity.ref,
			updatedAt: Date.now()
		};
		await writeStore<CachedDocument>(DOCUMENT_STORE, record);
		await updateInventoryTarget(
			getInventoryTargetId({
				targetType: 'itemDocument',
				configSlug: input.configSlug,
				blobSha: input.blobSha
			}),
			{
				status: 'fresh',
				lastCachedAt: record.updatedAt,
				estimatedBytes: getSerializedByteSize(record.content),
				blobSha: input.blobSha,
				path: input.path
			}
		);
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
		await updateInventoryTarget(
			getInventoryTargetId({
				targetType: 'itemDocument',
				configSlug: input.slug,
				itemId: indexItem.hrefItemId ?? indexItem.itemId
			}),
			{
				status: 'fresh',
				lastCachedAt: Date.now(),
				estimatedBytes: getSerializedByteSize(input.content),
				blobSha: indexItem.blobSha,
				path: indexItem.path
			}
		);
	},

	async refreshInventoryTarget(input: {
		targetId: string;
		fetcher: typeof fetch;
		priority?: CacheTaskPriority;
	}): Promise<void> {
		const record = (await readActiveInventoryRecords()).find(
			(candidate) => candidate.targetId === input.targetId
		);
		if (!record) {
			return;
		}

		if (record.targetType === 'blockSupport') {
			await githubRepositoryCache.warmBlockSupport({
				fetcher: input.fetcher,
				priority: input.priority ?? 'foreground'
			});
			return;
		}

		if (record.targetType === 'singletonDocument' && record.configSlug) {
			await githubRepositoryCache.warmSingletonDocumentRoute({
				slug: record.configSlug,
				fetcher: input.fetcher,
				priority: input.priority ?? 'foreground'
			});
			return;
		}

		if (record.targetType === 'collectionIndex' && record.configSlug) {
			await githubRepositoryCache.ensureCollectionIndex(record.configSlug, {
				fetcher: input.fetcher,
				force: true,
				priority: input.priority ?? 'foreground'
			});
			return;
		}

		if (record.targetType === 'collectionProjection' && record.configSlug && record.blobSha) {
			await hydrateProjectionBatch({
				fetcher: input.fetcher,
				slug: record.configSlug,
				blobShas: [record.blobSha]
			});
			return;
		}

		if (record.targetType === 'itemDocument' && record.configSlug && record.itemId) {
			await githubRepositoryCache.warmItemDocumentForRoute({
				slug: record.configSlug,
				itemId: record.itemId,
				fetcher: input.fetcher,
				priority: input.priority ?? 'foreground'
			});
		}
	},

	async refreshInventory(input: { fetcher: typeof fetch; scope?: 'all' | 'stale' }): Promise<void> {
		resetFreshnessBackoff();
		const records = await readActiveInventoryRecords();
		const targets =
			input.scope === 'stale'
				? records.filter(
						(record) =>
							record.status === 'stale' || record.status === 'missing' || record.status === 'error'
					)
				: records.filter((record) => record.targetType !== 'snapshot');

		for (const record of targets) {
			await githubRepositoryCache.refreshInventoryTarget({
				targetId: record.targetId,
				fetcher: input.fetcher,
				priority: 'topLevel'
			});
		}
		await buildInventoryFromActiveSnapshot();
	},

	async invalidatePaths(changedPaths: string[]): Promise<void> {
		if (!browser || changedPaths.length === 0) {
			return;
		}

		resetFreshnessBackoff();
		const snapshot = getActiveSnapshot();
		const hasNavigationChange = changedPaths.some(isNavigationPath);
		const changedPathSet = new Set(changedPaths);
		const configPathsBySlug = getConfigPathsBySlug(snapshot);
		const blockConfigPaths = getBlockConfigPaths(snapshot);
		const hasBlockSupportChange = changedPaths.some(
			(path) => isBlockSupportPath(path) || blockConfigPaths.has(path)
		);
		const hasConfigChange = (slug: string) => {
			const exactPath = configPathsBySlug.get(slug);
			return changedPaths.some((path) =>
				exactPath ? path === exactPath : path.endsWith(`${slug}.tentman.json`)
			);
		};
		const [indexes, projections, documents, singletonDocuments, blockSupport] = await Promise.all([
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE),
			readAllStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE),
			readAllStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE)
		]);
		const indexesToDelete = indexes.filter(
			(index) =>
				index.items.some((item) => changedPathSet.has(item.path)) ||
				changedPaths.some((path) => isPathInCollectionIdentity(path, index)) ||
				(snapshot &&
					indexMatchesActiveSnapshot(index, snapshot) &&
					hasConfigChange(index.configSlug))
		);
		const affectedSlugs = new Set(indexesToDelete.map((index) => index.configSlug));
		const affectedBlobShas = new Set(
			indexesToDelete.flatMap((index) => index.items.map((item) => item.blobSha))
		);

		await Promise.all([
			...indexesToDelete.map((index) => deleteStoreRecord(COLLECTION_INDEX_STORE, index.key)),
			...projections
				.filter(
					(projection) =>
						changedPathSet.has(projection.item.path) || affectedBlobShas.has(projection.blobSha)
				)
				.map((projection) => deleteStoreRecord(PROJECTION_STORE, projection.key)),
			...documents
				.filter(
					(document) => changedPathSet.has(document.path) || hasConfigChange(document.configSlug)
				)
				.map((document) => deleteStoreRecord(DOCUMENT_STORE, document.key)),
			...singletonDocuments
				.filter(
					(document) => changedPathSet.has(document.path) || hasConfigChange(document.configSlug)
				)
				.map((document) => deleteStoreRecord(SINGLETON_DOCUMENT_STORE, document.key)),
			...(hasBlockSupportChange && snapshot
				? blockSupport
						.filter(
							(record) =>
								record.repoFullName === snapshot.repoFullName &&
								record.ref === snapshot.identity.ref
						)
						.map((record) => deleteStoreRecord(BLOCK_SUPPORT_STORE, record.key))
				: [])
		]);

		await buildInventoryFromActiveSnapshot();
		if (hasNavigationChange) {
			cancelActiveSiteWarm();
		}
		await markInventoryTargetsStaleForPaths(changedPaths);
		await Promise.all([...affectedSlugs].map((slug) => notifyCollection(slug)));
	},

	async clearRepo(repoFullName: string): Promise<void> {
		if (!browser) {
			return;
		}

		const [
			snapshots,
			indexes,
			projections,
			documents,
			singletonDocuments,
			blockSupport,
			inventory
		] = await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE),
			readAllStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE),
			readAllStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE),
			readAllStore<GithubCacheInventoryRecord>(INVENTORY_STORE)
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
				.map((document) => deleteStoreRecord(DOCUMENT_STORE, document.key)),
			...singletonDocuments
				.filter((document) => document.repoFullName === repoFullName)
				.map((document) => deleteStoreRecord(SINGLETON_DOCUMENT_STORE, document.key)),
			...blockSupport
				.filter((record) => record.repoFullName === repoFullName)
				.map((record) => deleteStoreRecord(BLOCK_SUPPORT_STORE, record.key)),
			...inventory
				.filter((record) => record.repoFullName === repoFullName)
				.map((record) => deleteStoreRecord(INVENTORY_STORE, record.key))
		]);

		if (activeSnapshot?.repoFullName === repoFullName) {
			activeSnapshot = null;
			activeSnapshotIdentityKey = null;
			cancelActiveSiteWarm();
		}
	},

	async clearRepoRef(input: { repoFullName: string; ref: string }): Promise<void> {
		if (!browser) {
			return;
		}

		const [
			snapshots,
			indexes,
			projections,
			documents,
			singletonDocuments,
			blockSupport,
			inventory
		] = await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE),
			readAllStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE),
			readAllStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE),
			readAllStore<GithubCacheInventoryRecord>(INVENTORY_STORE)
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
				.map((index) => deleteStoreRecord(COLLECTION_INDEX_STORE, index.key)),
			...projections
				.filter((projection) =>
					indexes.some(
						(index) =>
							index.identity.repoKey.includes(input.repoFullName) &&
							index.identity.ref === input.ref &&
							index.identity.schemaIdentity === projection.schemaIdentity
					)
				)
				.map((projection) => deleteStoreRecord(PROJECTION_STORE, projection.key)),
			...documents
				.filter(
					(document) => document.repoFullName === input.repoFullName && document.ref === input.ref
				)
				.map((document) => deleteStoreRecord(DOCUMENT_STORE, document.key)),
			...singletonDocuments
				.filter(
					(document) => document.repoFullName === input.repoFullName && document.ref === input.ref
				)
				.map((document) => deleteStoreRecord(SINGLETON_DOCUMENT_STORE, document.key)),
			...blockSupport
				.filter((record) => record.repoFullName === input.repoFullName && record.ref === input.ref)
				.map((record) => deleteStoreRecord(BLOCK_SUPPORT_STORE, record.key)),
			...inventory
				.filter(
					(record) => record.repoFullName === input.repoFullName && record.activeRef === input.ref
				)
				.map((record) => deleteStoreRecord(INVENTORY_STORE, record.key))
		]);

		if (
			activeSnapshot?.repoFullName === input.repoFullName &&
			activeSnapshot.identity.ref === input.ref
		) {
			activeSnapshot = null;
			activeSnapshotIdentityKey = null;
			cancelActiveSiteWarm();
		}
	}
};

export const githubRepositoryCacheTestApi = {
	resetMemoryForReloadTests(): void {
		activeSnapshot = null;
		activeSnapshotIdentityKey = null;
		clearFreshnessTimer();
		resetFreshnessBackoff();
		freshnessCheckInFlight = null;
		cancelActiveSiteWarm();
		collectionListeners.clear();
		githubCacheInventoryStatus.set(emptyInventorySummary);
		syncWarmDebugStatus();
		updateWarmStatusFromInventory(emptyInventorySummary);
	},

	async reset(): Promise<void> {
		if (!browser) {
			activeSnapshot = null;
			activeSnapshotIdentityKey = null;
			fullDocumentBudgetPolicy = {
				bytes: DEFAULT_FULL_DOCUMENT_BUDGET_BYTES,
				recordLimit: DEFAULT_FULL_DOCUMENT_RECORD_LIMIT
			};
			syncWarmDebugStatus();
			return;
		}

		activeSnapshot = null;
		activeSnapshotIdentityKey = null;
		clearFreshnessTimer();
		resetFreshnessBackoff();
		fullDocumentBudgetPolicy = {
			bytes: DEFAULT_FULL_DOCUMENT_BUDGET_BYTES,
			recordLimit: DEFAULT_FULL_DOCUMENT_RECORD_LIMIT
		};
		freshnessCheckInFlight = null;
		cancelActiveSiteWarm();
		collectionListeners.clear();
		const database = await openDatabase();
		await new Promise<void>((resolve, reject) => {
			const storeNames = REQUIRED_STORE_NAMES.filter((storeName) =>
				database.objectStoreNames.contains(storeName)
			);
			if (storeNames.length === 0) {
				resolve();
				return;
			}

			const transaction = database.transaction(storeNames, 'readwrite');
			for (const storeName of storeNames) {
				transaction.objectStore(storeName).clear();
			}
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(transaction.error ?? new Error('Failed to clear cache database'));
		});
	},

	async getCollectionIndex(slug: string): Promise<SerializableCollectionIndex | null> {
		return getCachedCollectionIndex(slug);
	},

	async getCollectionIndexItem(slug: string, itemId: string): Promise<CollectionIndexItem | null> {
		return getCachedCollectionIndexItem(slug, itemId);
	},

	async getSingletonDocument(slug: string): Promise<CachedSingletonDocumentResult | null> {
		return githubRepositoryCache.getSingletonDocumentForRoute({ slug });
	},

	async getBlockSupport(): Promise<CachedBlockSupport | null> {
		return getCachedBlockSupport();
	},

	setFullDocumentBudgetForTests(input: { bytes?: number; recordLimit?: number }): void {
		fullDocumentBudgetPolicy = {
			bytes: input.bytes ?? DEFAULT_FULL_DOCUMENT_BUDGET_BYTES,
			recordLimit: input.recordLimit ?? DEFAULT_FULL_DOCUMENT_RECORD_LIMIT
		};
	},

	getFreshnessBackoffIndexForTests(): number {
		return freshnessBackoffIndex;
	}
};
