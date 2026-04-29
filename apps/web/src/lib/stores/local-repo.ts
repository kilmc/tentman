import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { invalidateAll } from '$app/navigation';
import { type LocalRepositoryIdentity } from '$lib/repository/selection';
import { createLocalRepositoryBackend, type LocalRepositoryBackend } from '$lib/repository/local';
import { traceRouting } from '$lib/utils/routing-trace';

const DATABASE_NAME = 'tentman-local-repo';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'selected-root';

type LocalRepoState = {
	status: 'idle' | 'loading' | 'ready' | 'error';
	repo: LocalRepositoryIdentity | null;
	backend: LocalRepositoryBackend | null;
	error: string | null;
};

async function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, 1);

		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME);
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	const database = await openDatabase();

	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
	const database = await openDatabase();

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readonly');
		const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
		request.onsuccess = () =>
			resolve((request.result as FileSystemDirectoryHandle | undefined) || null);
		request.onerror = () => reject(request.error);
	});
}

async function clearHandle(): Promise<void> {
	const database = await openDatabase();

	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).delete(HANDLE_KEY);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

async function persistBackendSelection(
	payload: { kind: 'local'; repo: LocalRepositoryIdentity } | { kind: 'none' }
) {
	const response = await fetch('/api/session/backend', {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		throw new Error(`Failed to persist backend selection (${response.status})`);
	}

	return (await response.json()) as {
		selectedBackend: { kind: 'github' | 'local' } | null;
		selectedRepo: { full_name: string } | null;
		selectionCommitted: boolean;
	};
}

async function ensureRepoHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	try {
		await handle.getDirectoryHandle('.git');
	} catch {
		throw new Error('The selected directory does not appear to be a git repository.');
	}

	const permission = handle.queryPermission
		? await handle.queryPermission({ mode: 'readwrite' })
		: 'prompt';
	if (permission === 'granted') {
		return;
	}

	const requested = handle.requestPermission
		? await handle.requestPermission({ mode: 'readwrite' })
		: 'denied';
	if (requested !== 'granted') {
		throw new Error('Tentman needs read/write access to edit the selected repository.');
	}
}

function getRepoIdentity(handle: FileSystemDirectoryHandle): LocalRepositoryIdentity {
	return {
		name: handle.name,
		pathLabel: handle.name
	};
}

function createStore() {
	const { subscribe, set, update } = writable<LocalRepoState>({
		status: 'idle',
		repo: null,
		backend: null,
		error: null
	});

	return {
		subscribe,

		async hydrate() {
			if (!browser) return;

			update((state) => ({ ...state, status: 'loading', error: null }));

			try {
				const handle = await loadHandle();
				if (!handle) {
					set({ status: 'idle', repo: null, backend: null, error: null });
					return;
				}

				const permission = handle.queryPermission
					? await handle.queryPermission({ mode: 'readwrite' })
					: 'prompt';
				if (permission === 'denied') {
					await this.clear();
					return;
				}

				const repo = getRepoIdentity(handle);
				set({
					status: 'ready',
					repo,
					backend: createLocalRepositoryBackend(handle, repo),
					error: null
				});
			} catch (error) {
				set({
					status: 'error',
					repo: null,
					backend: null,
					error: error instanceof Error ? error.message : 'Failed to restore local repository'
				});
			}
		},

		async open() {
			if (!browser) return;

			update((state) => ({ ...state, status: 'loading', error: null }));

			try {
				if (!window.showDirectoryPicker) {
					throw new Error(
						'Local repository mode requires a Chromium browser with File System Access support.'
					);
				}

				const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
				await ensureRepoHandle(handle);
				await saveHandle(handle);

				const repo = getRepoIdentity(handle);
				const persistedSelection = await persistBackendSelection({
					kind: 'local',
					repo
				});

				set({
					status: 'ready',
					repo,
					backend: createLocalRepositoryBackend(handle, repo),
					error: null
				});

				traceRouting('local-repo:selected', {
					repo: repo.pathLabel
				});
				traceRouting('local-repo:server-selection', {
					repo: repo.pathLabel,
					selectedBackend: persistedSelection.selectedBackend?.kind ?? null,
					selectedRepo: persistedSelection.selectedRepo?.full_name ?? null,
					selectionCommitted: persistedSelection.selectionCommitted
				});
				traceRouting('navigation:assign', {
					to: '/pages',
					source: 'local-repo.open'
				});
				window.location.assign('/pages');
			} catch (error) {
				set({
					status: 'error',
					repo: null,
					backend: null,
					error: error instanceof Error ? error.message : 'Failed to open local repository'
				});
				traceRouting('local-repo:error', {
					message: error instanceof Error ? error.message : 'Failed to open local repository'
				});
			}
		},

		async clear(options: { invalidate?: boolean } = {}) {
			if (!browser) return;

			await persistBackendSelection({ kind: 'none' });
			await clearHandle();
			set({ status: 'idle', repo: null, backend: null, error: null });
			traceRouting('local-repo:cleared');
			if (options.invalidate ?? true) {
				await invalidateAll();
			}
		}
	};
}

export const localRepo = createStore();
