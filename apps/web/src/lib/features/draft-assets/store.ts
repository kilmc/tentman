import type { ContentRecord } from '$lib/features/content-management/types';
import { browser } from '$app/environment';
import {
	DRAFT_ASSET_MAX_AGE_MS,
	type DraftAssetCreateOptions,
	type DraftAssetMetadata,
	type DraftAssetStore
} from './types';
import {
	buildDraftAssetMetadata,
	collectDraftAssetRefsFromContent,
	getDraftAssetId
} from './shared';

const DATABASE_NAME = 'tentman-draft-assets';
const DATABASE_VERSION = 1;
const MANIFEST_STORE = 'manifests';
const BLOB_STORE = 'fallback-blobs';
const OPFS_ROOT_DIRECTORY = 'tentman-draft-assets';

type ObjectUrlCache = Map<string, string>;

interface DraftAssetStoreBrowserOptions {
	databaseName?: string;
	opfsRootDirectory?: string;
	indexedDB?: IDBFactory;
	storage?: StorageManager;
	createObjectURL?: (object: Blob) => string;
	revokeObjectURL?: (url: string) => void;
	randomUUID?: () => string;
}

function createDraftAssetId(randomUUID?: (() => string) | undefined): string {
	if (typeof randomUUID === 'function') {
		return randomUUID();
	}

	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function openDatabase(indexedDbFactory: IDBFactory, databaseName: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDbFactory.open(databaseName, DATABASE_VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;

			if (!database.objectStoreNames.contains(MANIFEST_STORE)) {
				database.createObjectStore(MANIFEST_STORE, { keyPath: 'id' });
			}

			if (!database.objectStoreNames.contains(BLOB_STORE)) {
				database.createObjectStore(BLOB_STORE);
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function runTransaction<T>(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	storeName: string,
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
	const database = await openDatabase(indexedDbFactory, databaseName);

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, mode);
		const store = transaction.objectStore(storeName);
		const request = callback(store);

		transaction.oncomplete = () => {
			resolve(request?.result);
			database.close();
		};
		transaction.onerror = () => {
			reject(transaction.error);
			database.close();
		};
		transaction.onabort = () => {
			reject(transaction.error);
			database.close();
		};
	});
}

function canUseOpfs(storage?: StorageManager): boolean {
	return typeof storage?.getDirectory === 'function';
}

function getOpfsByteKey(repoKey: string, id: string): string {
	const repoSegment = repoKey.replace(/[^a-z0-9/_-]+/gi, '-').replace(/\/+/g, '--');
	return `${repoSegment}/${id}.bin`;
}

async function getOpfsRootDirectoryHandle(
	storage: StorageManager | undefined,
	rootDirectoryName: string
): Promise<FileSystemDirectoryHandle> {
	const getDirectory = storage?.getDirectory;
	if (!getDirectory) {
		throw new Error('OPFS is unavailable in this browser.');
	}

	const root = await getDirectory.call(storage);
	return root.getDirectoryHandle(rootDirectoryName, { create: true });
}

async function getOpfsFileHandle(
	storage: StorageManager | undefined,
	rootDirectoryName: string,
	byteKey: string,
	create = false
): Promise<FileSystemFileHandle> {
	const root = await getOpfsRootDirectoryHandle(storage, rootDirectoryName);
	const segments = byteKey.split('/').filter(Boolean);
	const fileName = segments.pop();

	if (!fileName) {
		throw new Error(`Expected file name for draft asset key "${byteKey}"`);
	}

	let current = root;
	for (const segment of segments) {
		current = await current.getDirectoryHandle(segment, { create });
	}

	return current.getFileHandle(fileName, { create });
}

async function writeBlobToOpfs(
	storage: StorageManager | undefined,
	rootDirectoryName: string,
	byteKey: string,
	blob: Blob
): Promise<void> {
	const handle = await getOpfsFileHandle(storage, rootDirectoryName, byteKey, true);
	const writable = await handle.createWritable();
	await writable.write(blob);
	await writable.close();
}

async function readBlobFromOpfs(
	storage: StorageManager | undefined,
	rootDirectoryName: string,
	byteKey: string
): Promise<Blob> {
	const handle = await getOpfsFileHandle(storage, rootDirectoryName, byteKey, false);
	return handle.getFile();
}

async function deleteBlobFromOpfs(
	storage: StorageManager | undefined,
	rootDirectoryName: string,
	byteKey: string
): Promise<void> {
	const segments = byteKey.split('/').filter(Boolean);
	const fileName = segments.pop();

	if (!fileName) {
		return;
	}

	let current = await getOpfsRootDirectoryHandle(storage, rootDirectoryName);
	for (const segment of segments) {
		current = await current.getDirectoryHandle(segment);
	}

	await current.removeEntry(fileName);
}

async function persistStorageIfAvailable(storage?: StorageManager): Promise<void> {
	try {
		if (typeof storage?.persist === 'function') {
			await storage.persist();
		}
	} catch {
		// Best effort only.
	}
}

async function getManifest(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	id: string
): Promise<DraftAssetMetadata | null> {
	const result = await runTransaction<DraftAssetMetadata>(
		indexedDbFactory,
		databaseName,
		MANIFEST_STORE,
		'readonly',
		(store) => store.get(id)
	);
	return result ?? null;
}

async function getAllManifests(
	indexedDbFactory: IDBFactory,
	databaseName: string
): Promise<DraftAssetMetadata[]> {
	const result = await runTransaction<DraftAssetMetadata[]>(
		indexedDbFactory,
		databaseName,
		MANIFEST_STORE,
		'readonly',
		(store) => store.getAll()
	);
	return result ?? [];
}

async function putManifest(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	metadata: DraftAssetMetadata
): Promise<void> {
	await runTransaction(indexedDbFactory, databaseName, MANIFEST_STORE, 'readwrite', (store) => {
		store.put(metadata);
	});
}

async function deleteManifest(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	id: string
): Promise<void> {
	await runTransaction(indexedDbFactory, databaseName, MANIFEST_STORE, 'readwrite', (store) => {
		store.delete(id);
	});
}

async function putBlob(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	byteKey: string,
	blob: Blob
): Promise<void> {
	await runTransaction(indexedDbFactory, databaseName, BLOB_STORE, 'readwrite', (store) => {
		store.put(blob, byteKey);
	});
}

async function getBlob(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	byteKey: string
): Promise<Blob | null> {
	const result = await runTransaction<Blob>(
		indexedDbFactory,
		databaseName,
		BLOB_STORE,
		'readonly',
		(store) => store.get(byteKey)
	);
	return result ?? null;
}

async function deleteBlob(
	indexedDbFactory: IDBFactory,
	databaseName: string,
	byteKey: string
): Promise<void> {
	await runTransaction(indexedDbFactory, databaseName, BLOB_STORE, 'readwrite', (store) => {
		store.delete(byteKey);
	});
}

export function createBrowserDraftAssetStore(
	options: DraftAssetStoreBrowserOptions = {}
): DraftAssetStore {
	const objectUrls: ObjectUrlCache = new Map();
	const indexedDbFactory = options.indexedDB ?? indexedDB;
	const storage = options.storage ?? navigator.storage;
	const createObjectURL = options.createObjectURL ?? ((object: Blob) => URL.createObjectURL(object));
	const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
	const randomUUID =
		options.randomUUID ??
		(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID.bind(crypto)
			: undefined);
	const databaseName = options.databaseName ?? DATABASE_NAME;
	const opfsRootDirectory = options.opfsRootDirectory ?? OPFS_ROOT_DIRECTORY;
	let gcPromise: Promise<void> | null = null;

	async function ensureGc() {
		if (!gcPromise) {
			gcPromise = gc().finally(() => {
				gcPromise = null;
			});
		}

		return gcPromise;
	}

	async function create(file: File, options: DraftAssetCreateOptions) {
		await persistStorageIfAvailable(storage);
		await ensureGc();

		const id = createDraftAssetId(randomUUID);
		const byteStore = canUseOpfs(storage) ? 'opfs' : 'idb';
		const byteKey =
			byteStore === 'opfs' ? getOpfsByteKey(options.repoKey, id) : `${options.repoKey}:${id}`;
		const metadata = buildDraftAssetMetadata({
			id,
			repoKey: options.repoKey,
			storagePath: options.storagePath,
			originalName: file.name,
			mimeType: file.type,
			size: file.size,
			byteStore,
			byteKey
		});

		if (byteStore === 'opfs') {
			await writeBlobToOpfs(storage, opfsRootDirectory, byteKey, file);
		} else {
			await putBlob(indexedDbFactory, databaseName, byteKey, file);
		}

		await putManifest(indexedDbFactory, databaseName, metadata);

		const previewUrl = createObjectURL(file);
		objectUrls.set(metadata.ref, previewUrl);

		return {
			ref: metadata.ref,
			previewUrl,
			metadata
		};
	}

	async function readFile(ref: string): Promise<File> {
		const metadata = await getMetadata(ref);
		if (!metadata) {
			throw new Error(`Draft asset not found for ${ref}`);
		}

		let blob: Blob | null = null;

		if (metadata.byteStore === 'opfs') {
			blob = await readBlobFromOpfs(storage, opfsRootDirectory, metadata.byteKey);
		} else {
			blob = await getBlob(indexedDbFactory, databaseName, metadata.byteKey);
		}

		if (!blob) {
			throw new Error(`Draft asset bytes not found for ${ref}`);
		}

		return new File([blob], metadata.originalName, {
			type: metadata.mimeType,
			lastModified: Date.parse(metadata.createdAt)
		});
	}

	async function resolveUrl(ref: string): Promise<string | null> {
		const cached = objectUrls.get(ref);
		if (cached) {
			return cached;
		}

		try {
			const file = await readFile(ref);
			const nextUrl = createObjectURL(file);
			objectUrls.set(ref, nextUrl);
			return nextUrl;
		} catch {
			return null;
		}
	}

	async function getMetadataForContent(content: ContentRecord): Promise<DraftAssetMetadata[]> {
		const refs = collectDraftAssetRefsFromContent(content);
		const manifestEntries = await Promise.all(refs.map((ref) => getMetadata(ref)));
		return manifestEntries.filter((entry): entry is DraftAssetMetadata => entry !== null);
	}

	async function getMetadata(ref: string): Promise<DraftAssetMetadata | null> {
		return getManifest(indexedDbFactory, databaseName, getDraftAssetId(ref));
	}

	async function remove(ref: string): Promise<void> {
		const metadata = await getMetadata(ref);
		const cached = objectUrls.get(ref);
		if (cached) {
			revokeObjectURL(cached);
			objectUrls.delete(ref);
		}

		if (!metadata) {
			return;
		}

		if (metadata.byteStore === 'opfs') {
			await deleteBlobFromOpfs(storage, opfsRootDirectory, metadata.byteKey).catch(() => {});
		} else {
			await deleteBlob(indexedDbFactory, databaseName, metadata.byteKey);
		}

		await deleteManifest(indexedDbFactory, databaseName, metadata.id);
	}

	async function gc(): Promise<void> {
		const manifests = await getAllManifests(indexedDbFactory, databaseName);
		const expirationThreshold = Date.now() - DRAFT_ASSET_MAX_AGE_MS;

		await Promise.all(
			manifests.map(async (metadata) => {
				const createdAt = Date.parse(metadata.createdAt);
				if (Number.isNaN(createdAt) || createdAt >= expirationThreshold) {
					return;
				}

				await remove(metadata.ref);
			})
		);
	}

	void ensureGc().catch(() => {
		// Best effort startup cleanup only.
	});

	return {
		create,
		readFile,
		resolveUrl,
		delete: remove,
		getMetadata,
		getMetadataForContent,
		collectFromContent: collectDraftAssetRefsFromContent,
		gc
	};
}

function createNoopDraftAssetStore(): DraftAssetStore {
	return {
		create: async () => {
			throw new Error('Draft assets are only available in the browser.');
		},
		readFile: async () => {
			throw new Error('Draft assets are only available in the browser.');
		},
		resolveUrl: async () => null,
		delete: async () => {},
		getMetadata: async () => null,
		getMetadataForContent: async () => [],
		collectFromContent: collectDraftAssetRefsFromContent,
		gc: async () => {}
	};
}

export const draftAssetStore: DraftAssetStore = browser
	? createBrowserDraftAssetStore()
	: createNoopDraftAssetStore();
