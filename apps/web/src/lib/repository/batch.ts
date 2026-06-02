import type {
	RepositoryBackend,
	RepositoryFileChange,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import { normalizeGitHubPath } from '$lib/utils/validation';

interface PendingWrite {
	type: 'text' | 'binary';
	path: string;
	content: string | Uint8Array;
}

function normalizeRepositoryPath(path: string): string {
	return normalizeGitHubPath(path);
}

function getPendingWrite(
	changes: RepositoryFileChange[],
	path: string
): PendingWrite | { type: 'delete'; path: string } | null {
	const normalizedPath = normalizeRepositoryPath(path);

	for (let index = changes.length - 1; index >= 0; index -= 1) {
		const change = changes[index];
		if (normalizeRepositoryPath(change.path) !== normalizedPath) {
			continue;
		}

		if (change.type === 'delete') {
			return {
				type: 'delete',
				path: normalizedPath
			};
		}

		return {
			type: change.type === 'writeText' ? 'text' : 'binary',
			path: normalizedPath,
			content: change.content
		};
	}

	return null;
}

function createDeletedFileError(path: string): Error {
	return new Error(`File has been deleted in the pending repository batch: ${path}`);
}

export async function withBatchedRepositoryWrites<T>(
	backend: RepositoryBackend,
	options: RepositoryWriteOptions | undefined,
	action: (batchBackend: RepositoryBackend) => Promise<T>
): Promise<T> {
	const changes: RepositoryFileChange[] = [];
	const batchBackend: RepositoryBackend = {
		...backend,

		async readTextFile(path: string, readOptions?: RepositoryReadOptions): Promise<string> {
			const pending = getPendingWrite(changes, path);
			if (pending?.type === 'text') {
				return pending.content as string;
			}

			if (pending?.type === 'binary') {
				throw new Error(`Pending repository batch file is binary: ${path}`);
			}

			if (pending?.type === 'delete') {
				throw createDeletedFileError(path);
			}

			return backend.readTextFile(path, readOptions);
		},

		async writeTextFile(path: string, content: string): Promise<void> {
			changes.push({
				type: 'writeText',
				path: normalizeRepositoryPath(path),
				content
			});
		},

		async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
			changes.push({
				type: 'writeBinary',
				path: normalizeRepositoryPath(path),
				content
			});
		},

		async deleteFile(path: string): Promise<void> {
			changes.push({
				type: 'delete',
				path: normalizeRepositoryPath(path)
			});
		},

		async fileExists(path: string, readOptions?: RepositoryReadOptions): Promise<boolean> {
			const pending = getPendingWrite(changes, path);
			if (pending?.type === 'delete') {
				return false;
			}

			if (pending) {
				return true;
			}

			return backend.fileExists(path, readOptions);
		}
	};

	const result = await action(batchBackend);

	if (changes.length > 0) {
		if (backend.commitChanges) {
			await backend.commitChanges(changes, options);
		} else {
			for (const change of changes) {
				if (change.type === 'writeText') {
					await backend.writeTextFile(change.path, change.content, options);
				} else if (change.type === 'writeBinary') {
					await backend.writeBinaryFile(change.path, change.content, options);
				} else {
					await backend.deleteFile(change.path, options);
				}
			}
		}
	}

	return result;
}
