import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import {
	clearCollectionNavigationCache,
	clearCollectionNavigationCacheForScope
} from './collections';
import {
	clearSingletonDocumentCache,
	clearSingletonDocumentCacheForScope
} from './documents';
import { clearDraftChangeIndexCache } from './drafts';
import {
	clearRepositorySnapshotCache,
	clearRepositorySnapshotCacheForScope
} from './snapshot';
import {
	clearSingletonConfigStateCache,
	clearSingletonConfigStateCacheForScope
} from './states';

export interface RepositoryDataInvalidationInput {
	backend: RepositoryBackend;
	ref?: string | null;
	changedPaths?: string[];
	reason: 'content-write' | 'publish' | 'discard' | 'navigation-manifest' | 'repo-instruction';
}

function hasScopedPaths(input: RepositoryDataInvalidationInput): input is RepositoryDataInvalidationInput & {
	changedPaths: string[];
} {
	return Array.isArray(input.changedPaths) && input.changedPaths.length > 0;
}

function hasScopedRef(input: RepositoryDataInvalidationInput): boolean {
	return typeof input.ref === 'string' && input.ref.length > 0;
}

function isRepositoryStructurePath(path: string): boolean {
	return (
		path === 'tentman.json' ||
		path.endsWith('.tentman.json') ||
		path === 'tentman/navigation-manifest.json'
	);
}

function shouldInvalidateSnapshot(input: RepositoryDataInvalidationInput): boolean {
	if (!hasScopedPaths(input)) {
		return true;
	}

	if (input.reason === 'publish' || input.reason === 'discard' || input.reason === 'repo-instruction') {
		return true;
	}

	return input.changedPaths.some(isRepositoryStructurePath);
}

function clearAllRepositoryDataCaches(): void {
	clearRepositorySnapshotCache();
	clearCollectionNavigationCache();
	clearSingletonDocumentCache();
	clearSingletonConfigStateCache();
	clearDraftChangeIndexCache();
}

export function invalidateRepositoryData(input: RepositoryDataInvalidationInput): void {
	const repoKey = input.backend.cacheKey;
	const scoped = hasScopedPaths(input) || hasScopedRef(input);
	const invalidatesSnapshot = shouldInvalidateSnapshot(input);

	if (!scoped) {
		clearAllRepositoryDataCaches();
	} else {
		const scope = {
			repoKey,
			ref: input.ref,
			changedPaths: input.changedPaths
		};

		if (invalidatesSnapshot) {
			clearRepositorySnapshotCacheForScope(scope);
		}

		clearCollectionNavigationCacheForScope(scope);
		clearSingletonDocumentCacheForScope(scope);
		clearSingletonConfigStateCacheForScope({
			repoKey,
			ref: input.ref
		});
		clearDraftChangeIndexCache();
	}

	logTiming('repository-data.invalidate', {
		repoKey,
		ref: input.ref ?? null,
		reason: input.reason,
		changedPathCount: input.changedPaths?.length ?? 0,
		scoped,
		invalidatesSnapshot
	});
}
