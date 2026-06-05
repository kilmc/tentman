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
import type { RepoBootstrapIdentity, RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';

const DATABASE_NAME = 'tentman-github-repository-cache';
const DATABASE_VERSION = 2;
const SNAPSHOT_STORE = 'snapshots';
const COLLECTION_INDEX_STORE = 'collectionIndexes';
const PROJECTION_STORE = 'projections';
const DOCUMENT_STORE = 'documents';
const SINGLETON_DOCUMENT_STORE = 'singletonDocuments';
const BLOCK_SUPPORT_STORE = 'blockSupport';
const REQUIRED_STORE_NAMES = [
	SNAPSHOT_STORE,
	COLLECTION_INDEX_STORE,
	PROJECTION_STORE,
	DOCUMENT_STORE,
	SINGLETON_DOCUMENT_STORE,
	BLOCK_SUPPORT_STORE
] as const;
const VISIBLE_PROJECTION_LIMIT = 30;
const BACKGROUND_PROJECTION_BATCH_SIZE = 20;
const SITE_WARM_PROJECTION_BATCH_SIZE = 20;
const SITE_WARM_READY_RESET_MS = 2500;
const CACHE_PROGRESS_LARGE_TASK_THRESHOLD = 25;
const CACHE_PROGRESS_SLOW_JOB_MS = 800;

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
const collectionListeners = new Map<string, Set<CollectionListener>>();
const cacheTasks = new Map<string, CacheTask<unknown>>();
const totalQueuedTasksByKind = new Map<CacheTaskKind, number>();
const completedQueuedTasksByKind = new Map<CacheTaskKind, number>();
const erroredQueuedTasksByKind = new Map<CacheTaskKind, number>();

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

	console.warn(`GitHub repository cache store "${storeName}" is unavailable; skipping cache access.`);
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
		transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
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
		transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to delete ${storeName}`));
	});
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

function getSingletonDocumentKey(input: {
	repoFullName: string;
	ref: string;
	treeSha: string;
	configSlug: string;
}): string {
	return `${input.repoFullName}:${input.ref}:${input.treeSha}:${input.configSlug}`;
}

function getBlockSupportKey(input: { repoFullName: string; ref: string; treeSha: string }): string {
	return `${input.repoFullName}:${input.ref}:${input.treeSha}`;
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
	const shouldShowProgress =
		totalQueuedTasks >= CACHE_PROGRESS_LARGE_TASK_THRESHOLD || get(githubCacheWarmStatus).showProgress;
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

	await writeStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE, {
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
	});
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

	const cached = await getCachedItemDocumentForIndexItem(snapshot, input.slug, input.indexItem);
	if (cached) {
		return cached;
	}

	await enqueueCacheTask({
		runId: input.runId,
		key: `itemDocument:${input.slug}:${input.itemId}`,
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
			activeDraftBranch: input.bootstrap.activeDraftBranch,
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
			key: `collectionIndex:${slug}`,
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
			for (let index = 0; index < remainingBlobShas.length; index += BACKGROUND_PROJECTION_BATCH_SIZE) {
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

		const cached = await readStore<CachedSingletonDocument>(
			SINGLETON_DOCUMENT_STORE,
			getSingletonDocumentKey({
				repoFullName: snapshot.repoFullName,
				ref: snapshot.identity.ref,
				treeSha: snapshot.identity.treeSha,
				configSlug: input.slug
			})
		);
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
		const path = config ? getSingletonContentPath(config) : null;
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

		await writeStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE, {
			key: getSingletonDocumentKey({
				repoFullName: snapshot.repoFullName,
				ref: snapshot.identity.ref,
				treeSha: snapshot.identity.treeSha,
				configSlug: input.slug
			}),
			repoFullName: snapshot.repoFullName,
			ref: snapshot.identity.ref,
			treeSha: snapshot.identity.treeSha,
			configSlug: input.slug,
			path,
			content: input.content,
			updatedAt: Date.now()
		});
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
			key: 'blockRegistry',
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

		await enqueueCacheTask({
			runId: siteWarmRunId,
			key: `singletonDocument:${input.slug}`,
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
				totalTasks: 0,
				completedTasks: 0,
				showProgress: false,
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
							key: `collectionProjectionBatch:${index.configSlug}:${blobShas.join(',')}`,
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
		await writeStore<CachedDocument>(DOCUMENT_STORE, {
			key: getDocumentKey(input),
			...input,
			ref: snapshot?.identity.ref,
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
		const [snapshots, indexes, projections, documents, singletonDocuments, blockSupport] =
			await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE),
			readAllStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE),
			readAllStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE)
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
				.map((document) => deleteStoreRecord(DOCUMENT_STORE, document.key)),
			...singletonDocuments
				.filter(
					(document) =>
						changedPaths.includes(document.path) ||
						(hasRepositoryStructureChange &&
							snapshot &&
							document.repoFullName === snapshot.repoFullName &&
							document.ref === snapshot.identity.ref)
				)
				.map((document) => deleteStoreRecord(SINGLETON_DOCUMENT_STORE, document.key)),
			...(hasRepositoryStructureChange && snapshot
				? blockSupport
						.filter(
							(record) =>
								record.repoFullName === snapshot.repoFullName &&
								record.ref === snapshot.identity.ref
						)
						.map((record) => deleteStoreRecord(BLOCK_SUPPORT_STORE, record.key))
				: [])
		]);

		if (hasRepositoryStructureChange && snapshot && activeSnapshot?.key === snapshot.key) {
			activeSnapshot = null;
			activeSnapshotIdentityKey = null;
			cancelActiveSiteWarm();
		}

		await Promise.all([...affectedSlugs].map((slug) => notifyCollection(slug)));
	},

	async clearRepo(repoFullName: string): Promise<void> {
		if (!browser) {
			return;
		}

		const [snapshots, indexes, projections, documents, singletonDocuments, blockSupport] =
			await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE),
			readAllStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE),
			readAllStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE)
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
				.map((record) => deleteStoreRecord(BLOCK_SUPPORT_STORE, record.key))
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

		const [snapshots, indexes, projections, documents, singletonDocuments, blockSupport] =
			await Promise.all([
			readAllStore<CachedSnapshot>(SNAPSHOT_STORE),
			readAllStore<SerializableCollectionIndex>(COLLECTION_INDEX_STORE),
			readAllStore<CachedProjection>(PROJECTION_STORE),
			readAllStore<CachedDocument>(DOCUMENT_STORE),
			readAllStore<CachedSingletonDocument>(SINGLETON_DOCUMENT_STORE),
			readAllStore<CachedBlockSupport>(BLOCK_SUPPORT_STORE)
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
				.filter(
					(projection) =>
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
				.map((record) => deleteStoreRecord(BLOCK_SUPPORT_STORE, record.key))
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
	async reset(): Promise<void> {
		if (!browser) {
			activeSnapshot = null;
			activeSnapshotIdentityKey = null;
			syncWarmDebugStatus();
			return;
		}

		activeSnapshot = null;
		activeSnapshotIdentityKey = null;
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
	}
};
