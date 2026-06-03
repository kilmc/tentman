import type { ParsedContentConfig } from '$lib/config/parse';
import {
	isMarkdownContentPath,
	parseMarkdownContentRecord
} from '$lib/features/content-management/transforms';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import { resolveConfigPath } from '$lib/utils/validation';
import { canUseGitHubSource, readGitHubTextBlob } from './source';
import { getRepositorySnapshot } from './snapshot';
import type { RepositorySnapshot, RepositoryTreeEntry } from './types';

type SingletonFileConfig = ParsedContentConfig & {
	content: {
		mode: 'file';
		path: string;
		itemsPath?: undefined;
	};
};

interface SingletonDocumentInput {
	backend: RepositoryBackend;
	slug: string;
	ref?: string | null;
}

const singletonDocumentCache = new Map<string, ContentRecord>();

export function isSingletonFileConfig(config: ParsedContentConfig): config is SingletonFileConfig {
	return (
		!config.collection &&
		config.content.mode === 'file' &&
		typeof config.content.path === 'string' &&
		!config.content.itemsPath
	);
}

export function parseSingletonContent(config: SingletonFileConfig, raw: string): ContentRecord {
	if (isMarkdownContentPath(config.content.path)) {
		return parseMarkdownContentRecord(raw);
	}

	return JSON.parse(raw) as ContentRecord;
}

function findTreeEntry(snapshot: RepositorySnapshot, path: string): RepositoryTreeEntry | null {
	return snapshot.tree?.entries.find((entry) => entry.type === 'blob' && entry.path === path) ?? null;
}

function getSingletonDocumentCacheKey(
	snapshot: RepositorySnapshot,
	configSlug: string,
	path: string,
	blobSha: string
): string {
	return [
		'singleton-document',
		snapshot.identity.repoKey,
		snapshot.identity.ref,
		snapshot.identity.headSha,
		snapshot.identity.treeSha,
		configSlug,
		path,
		blobSha
	].join(':');
}

export async function getSingletonDocument(
	input: SingletonDocumentInput
): Promise<ContentRecord | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const start = performance.now();
	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const discoveredConfig = snapshot.configIndex.bySlug.get(input.slug);
	if (!discoveredConfig || !isSingletonFileConfig(discoveredConfig.config)) {
		return null;
	}

	const path = resolveConfigPath(discoveredConfig.path, discoveredConfig.config.content.path);
	const entry = findTreeEntry(snapshot, path);
	if (!entry) {
		return null;
	}

	const cacheKey = getSingletonDocumentCacheKey(snapshot, discoveredConfig.slug, path, entry.sha);
	const cached = singletonDocumentCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const content = parseSingletonContent(
		discoveredConfig.config,
		await readGitHubTextBlob(input.backend, entry.sha)
	);
	singletonDocumentCache.set(cacheKey, content);
	logTiming('repository-data.singleton-document.load', {
		repoKey: snapshot.identity.repoKey,
		ref: snapshot.identity.ref,
		treeSha: snapshot.identity.treeSha,
		slug: input.slug,
		path,
		durationMs: performance.now() - start
	});
	return content;
}

export function clearSingletonDocumentCache(): void {
	singletonDocumentCache.clear();
}

export function clearSingletonDocumentCacheForScope(input: {
	repoKey: string;
	ref?: string | null;
	changedPaths?: string[];
}): void {
	const paths = input.changedPaths?.filter(Boolean) ?? [];

	for (const key of singletonDocumentCache.keys()) {
		if (!key.includes(`:${input.repoKey}:`)) {
			continue;
		}

		if (input.ref && !key.includes(`:${input.ref}:`)) {
			continue;
		}

		if (paths.length > 0 && !paths.some((path) => key.includes(`:${path}:`))) {
			continue;
		}

		singletonDocumentCache.delete(key);
	}
}
