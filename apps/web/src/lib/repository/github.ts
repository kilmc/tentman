import type { Octokit } from 'octokit';
import {
	discoverGitHubBlockConfigs,
	discoverGitHubConfigs,
	type DiscoveredBlockConfig
} from '$lib/config/discovery';
import { parseRootConfig, type RootConfig } from '$lib/config/root-config';
import { writeGitHubImage } from '$lib/github/image';
import type {
	RepoEntry,
	RepositoryBackend,
	RepositoryFileChange,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import { isPerformanceLoggingEnabled, logTiming } from '$lib/utils/performance-logging';
import { normalizeGitHubPath } from '$lib/utils/validation';
import {
	traceGitHubRequest,
	type GitHubRateLimitHeaders,
	type GitHubRequestKind,
	type RequestCacheResult,
	type RequestDuplicateState,
	type RequestResultStatus
} from '$lib/utils/workflow-instrumentation';

interface CachedMetadataEntry<T> {
	value: T;
	timestamp: number;
}

interface GitHubRepositoryRequestStat {
	repoKey: string;
	operation: string;
	requestKind: GitHubRequestKind;
	path: string;
	ref: string | null;
	count: number;
	totalDurationMs: number;
	lastDurationMs: number;
	lastResultStatus: RequestResultStatus;
	lastResponseStatus: number | null;
	lastRateLimit: GitHubRateLimitHeaders;
	lastRetryAfter: string | null;
	lastCacheResult: RequestCacheResult | null;
	lastDedupeState: RequestDuplicateState | null;
	lastUpdatedAt: number;
}

const METADATA_CACHE_TTL = 60 * 1000;
const rootConfigCache = new Map<string, CachedMetadataEntry<RootConfig | null>>();
const rootConfigInflight = new Map<string, Promise<RootConfig | null>>();
const blockConfigCache = new Map<string, CachedMetadataEntry<DiscoveredBlockConfig[]>>();
const blockConfigInflight = new Map<string, Promise<DiscoveredBlockConfig[]>>();
const textFileCache = new Map<string, CachedMetadataEntry<string>>();
const textFileInflight = new Map<string, Promise<string>>();
const githubRepositoryRequestStats = new Map<string, GitHubRepositoryRequestStat>();

export interface GitHubRepositoryIdentity {
	owner: string;
	name: string;
	full_name: string;
	default_branch: string;
}

export interface GitHubRepositoryBackend extends RepositoryBackend {
	kind: 'github';
	owner: string;
	repo: string;
	fullName: string;
	octokit: Octokit;
}

function decodeGitHubContent(content: string): string {
	return Buffer.from(content, 'base64').toString('utf-8');
}

function sanitizeRepositoryPath(path: string): string {
	return normalizeGitHubPath(path);
}

function dedupeChanges(changes: RepositoryFileChange[]): RepositoryFileChange[] {
	const changesByPath = new Map<string, RepositoryFileChange>();

	for (const change of changes) {
		changesByPath.set(sanitizeRepositoryPath(change.path), {
			...change,
			path: sanitizeRepositoryPath(change.path)
		});
	}

	return [...changesByPath.values()];
}

function isGitHubRequestInstrumentationEnabled(): boolean {
	return isPerformanceLoggingEnabled();
}

function getGitHubRepositoryRequestStatKey(
	repoKey: string,
	operation: string,
	path: string,
	ref: string | null
): string {
	return `${repoKey}:${operation}:${path}:${ref ?? '-'}`;
}

function recordGitHubRepositoryRequestStat(
	repoKey: string,
	operation: string,
	requestKind: GitHubRequestKind,
	path: string,
	ref: string | null,
	durationMs: number,
	input: {
		resultStatus: RequestResultStatus;
		responseStatus: number | null;
		rateLimit: GitHubRateLimitHeaders;
		retryAfter: string | null;
		cacheResult?: RequestCacheResult | null;
		dedupeState?: RequestDuplicateState | null;
	}
): void {
	if (!isGitHubRequestInstrumentationEnabled()) {
		return;
	}

	const statKey = getGitHubRepositoryRequestStatKey(repoKey, operation, path, ref);
	const existing = githubRepositoryRequestStats.get(statKey);
	const nextStat: GitHubRepositoryRequestStat = existing
		? {
				...existing,
				count: existing.count + 1,
				totalDurationMs: existing.totalDurationMs + durationMs,
				lastDurationMs: durationMs,
				lastResultStatus: input.resultStatus,
				lastResponseStatus: input.responseStatus,
				lastRateLimit: input.rateLimit,
				lastRetryAfter: input.retryAfter,
				lastCacheResult: input.cacheResult ?? null,
				lastDedupeState: input.dedupeState ?? null,
				lastUpdatedAt: Date.now()
			}
		: {
				repoKey,
				operation,
				requestKind,
				path,
				ref,
				count: 1,
				totalDurationMs: durationMs,
				lastDurationMs: durationMs,
				lastResultStatus: input.resultStatus,
				lastResponseStatus: input.responseStatus,
				lastRateLimit: input.rateLimit,
				lastRetryAfter: input.retryAfter,
				lastCacheResult: input.cacheResult ?? null,
				lastDedupeState: input.dedupeState ?? null,
				lastUpdatedAt: Date.now()
			};

	githubRepositoryRequestStats.set(statKey, nextStat);
	logTiming('github.repository.request', {
		repoKey,
		operation,
		requestKind,
		path,
		ref,
		durationMs,
		count: nextStat.count,
		resultStatus: input.resultStatus,
		responseStatus: input.responseStatus,
		rateLimit: input.rateLimit,
		retryAfter: input.retryAfter,
		cacheResult: input.cacheResult ?? null,
		dedupeState: input.dedupeState ?? null
	});
}

function readHeader(headers: unknown, name: string): string | null {
	if (!headers || typeof headers !== 'object') {
		return null;
	}
	const record = headers as Record<string, unknown>;
	const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
	return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function getResponseHeaders(value: unknown): unknown {
	if (!value || typeof value !== 'object') {
		return null;
	}
	if ('headers' in value) {
		return value.headers;
	}
	if ('response' in value && value.response && typeof value.response === 'object') {
		return getResponseHeaders(value.response);
	}
	return null;
}

function getResponseStatus(value: unknown): number | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	if ('status' in value && typeof value.status === 'number') {
		return value.status;
	}
	if ('response' in value && value.response && typeof value.response === 'object') {
		return getResponseStatus(value.response);
	}
	return null;
}

function getRateLimitHeaders(headers: unknown): GitHubRateLimitHeaders {
	return {
		limit: readHeader(headers, 'x-ratelimit-limit'),
		remaining: readHeader(headers, 'x-ratelimit-remaining'),
		reset: readHeader(headers, 'x-ratelimit-reset'),
		used: readHeader(headers, 'x-ratelimit-used'),
		resource: readHeader(headers, 'x-ratelimit-resource')
	};
}

function getRequestKind(operation: string): GitHubRequestKind {
	if (operation.includes('Compare') || operation.includes('compare')) {
		return 'compare';
	}
	if (operation.includes('Tree') || operation.includes('Directory')) {
		return 'tree';
	}
	if (operation.includes('Blob') || operation.includes('Binary')) {
		return 'blob';
	}
	if (operation.includes('Branch')) {
		return 'branch';
	}
	if (operation.includes('Commit') || operation.includes('Ref')) {
		return operation.includes('Ref') ? 'ref' : 'commit';
	}
	if (operation.includes('delete') || operation.includes('Delete')) {
		return 'delete';
	}
	if (operation.includes('write') || operation.includes('Write')) {
		return 'write';
	}
	if (operation.includes('Config')) {
		return 'metadata';
	}
	return 'contents';
}

async function instrumentGitHubRepositoryRequest<T>(
	repoKey: string,
	operation: string,
	path: string,
	ref: string | null,
	action: () => Promise<T>,
	options: {
		cacheResult?: RequestCacheResult | null;
		dedupeState?: RequestDuplicateState | null;
		requestKind?: GitHubRequestKind;
	} = {}
): Promise<T> {
	const start = performance.now();
	const requestKind = options.requestKind ?? getRequestKind(operation);
	try {
		const result = await traceGitHubRequest(
			{
				source: 'repository-backend',
				operation,
				requestKind,
				repoKey,
				ref,
				path,
				cacheResult: options.cacheResult ?? null,
				dedupeState: options.dedupeState ?? null
			},
			action
		);
		const headers = getResponseHeaders(result);
		recordGitHubRepositoryRequestStat(
			repoKey,
			operation,
			requestKind,
			path,
			ref,
			performance.now() - start,
			{
				resultStatus: 'ok',
				responseStatus: getResponseStatus(result),
				rateLimit: getRateLimitHeaders(headers),
				retryAfter: readHeader(headers, 'retry-after'),
				cacheResult: options.cacheResult ?? null,
				dedupeState: options.dedupeState ?? null
			}
		);
		return result;
	} catch (error) {
		const headers = getResponseHeaders(error);
		recordGitHubRepositoryRequestStat(
			repoKey,
			operation,
			requestKind,
			path,
			ref,
			performance.now() - start,
			{
				resultStatus: 'error',
				responseStatus: getResponseStatus(error),
				rateLimit: getRateLimitHeaders(headers),
				retryAfter: readHeader(headers, 'retry-after'),
				cacheResult: options.cacheResult ?? null,
				dedupeState: options.dedupeState ?? null
			}
		);
		throw error;
	}
}

function isFresh<T>(entry: CachedMetadataEntry<T> | undefined): entry is CachedMetadataEntry<T> {
	return entry !== undefined && Date.now() - entry.timestamp < METADATA_CACHE_TTL;
}

function readCachedMetadata<T>(
	key: string,
	cache: Map<string, CachedMetadataEntry<T>>,
	inflight: Map<string, Promise<T>>,
	load: () => Promise<T>
): Promise<T> {
	const cachedEntry = cache.get(key);
	if (isFresh(cachedEntry)) {
		return Promise.resolve(cachedEntry.value);
	}

	const pending = inflight.get(key);
	if (pending) {
		return pending;
	}

	const fetchPromise = load()
		.then((value) => {
			cache.set(key, {
				value,
				timestamp: Date.now()
			});
			return value;
		})
		.finally(() => {
			inflight.delete(key);
		});

	inflight.set(key, fetchPromise);
	return fetchPromise;
}

function getRootConfigCacheKey(repoKey: string): string {
	return `${repoKey}:root-config`;
}

function getBlockConfigCacheKey(repoKey: string): string {
	return `${repoKey}:block-configs`;
}

function getTextFileCacheKey(repoKey: string, path: string, ref: string | null): string {
	return `${repoKey}:text-file:${ref ?? '-'}:${path}`;
}

function invalidateCachedTextFile(repoKey: string, path: string, ref: string | null): void {
	const key = getTextFileCacheKey(repoKey, path, ref);
	textFileCache.delete(key);
	textFileInflight.delete(key);
}

export function invalidateGitHubRepositoryMetadataCache(repoKey: string): void {
	rootConfigCache.delete(getRootConfigCacheKey(repoKey));
	rootConfigInflight.delete(getRootConfigCacheKey(repoKey));
	blockConfigCache.delete(getBlockConfigCacheKey(repoKey));
	blockConfigInflight.delete(getBlockConfigCacheKey(repoKey));
}

export function clearGitHubRepositoryMetadataCache(): void {
	rootConfigCache.clear();
	rootConfigInflight.clear();
	blockConfigCache.clear();
	blockConfigInflight.clear();
	textFileCache.clear();
	textFileInflight.clear();
}

export function clearGitHubRepositoryRequestStats(): void {
	githubRepositoryRequestStats.clear();
}

export function getGitHubRepositoryRequestStats(): GitHubRepositoryRequestStat[] {
	return [...githubRepositoryRequestStats.values()].sort(
		(left, right) => right.lastUpdatedAt - left.lastUpdatedAt
	);
}

export function createGitHubRepositoryBackend(
	octokit: Octokit,
	repository: GitHubRepositoryIdentity,
	options?: {
		defaultRef?: string;
	}
): GitHubRepositoryBackend {
	const { owner, name, full_name } = repository;
	const defaultRef = options?.defaultRef ?? repository.default_branch;
	const repoKey = `github:${owner}/${name}?ref=${defaultRef}`;

	function readRef(options?: RepositoryReadOptions): string | undefined {
		return options?.ref ?? defaultRef;
	}

	return {
		kind: 'github',
		cacheKey: repoKey,
		label: full_name,
		supportsDraftBranches: true,
		owner,
		repo: name,
		fullName: full_name,
		octokit,

		discoverConfigs() {
			return instrumentGitHubRepositoryRequest(
				repoKey,
				'discoverConfigs',
				'<config-discovery>',
				defaultRef ?? null,
				() => discoverGitHubConfigs(octokit, owner, name, defaultRef)
			);
		},

		discoverBlockConfigs() {
			return readCachedMetadata(
				getBlockConfigCacheKey(repoKey),
				blockConfigCache,
				blockConfigInflight,
				() =>
					instrumentGitHubRepositoryRequest(
						repoKey,
						'discoverBlockConfigs',
						'<block-config-discovery>',
						defaultRef ?? null,
						() => discoverGitHubBlockConfigs(octokit, owner, name, defaultRef)
					)
			);
		},

		async readRootConfig(): Promise<RootConfig | null> {
			return readCachedMetadata(
				getRootConfigCacheKey(repoKey),
				rootConfigCache,
				rootConfigInflight,
				async () => {
					try {
						const { data } = await instrumentGitHubRepositoryRequest(
							repoKey,
							'readRootConfig',
							'tentman.json',
							defaultRef ?? null,
							() =>
								octokit.rest.repos.getContent({
									owner,
									repo: name,
									path: 'tentman.json',
									...(defaultRef ? { ref: defaultRef } : {})
								})
						);

						if (!('content' in data) || Array.isArray(data)) {
							return null;
						}

						return parseRootConfig(decodeGitHubContent(data.content));
					} catch {
						return null;
					}
				}
			);
		},

		async readTextFile(path: string, options?: RepositoryReadOptions): Promise<string> {
			const ref = readRef(options);
			const normalizedPath = sanitizeRepositoryPath(path);
			return readCachedMetadata(
				getTextFileCacheKey(repoKey, normalizedPath, ref ?? null),
				textFileCache,
				textFileInflight,
				async () => {
					const { data } = await instrumentGitHubRepositoryRequest(
						repoKey,
						'readTextFile',
						normalizedPath,
						ref ?? null,
						() =>
							octokit.rest.repos.getContent({
								owner,
								repo: name,
								path: normalizedPath,
								...(ref && { ref })
							})
					);

					if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
						throw new Error(`Expected file at ${normalizedPath}`);
					}

					return decodeGitHubContent(data.content);
				}
			);
		},

		async writeTextFile(
			path: string,
			content: string,
			options?: RepositoryWriteOptions
		): Promise<void> {
			let sha: string | undefined;
			const ref = readRef(options);
			const normalizedPath = sanitizeRepositoryPath(path);

			try {
				const { data } = await instrumentGitHubRepositoryRequest(
					repoKey,
					'readForWriteTextFile',
					normalizedPath,
					ref ?? null,
					() =>
						octokit.rest.repos.getContent({
							owner,
							repo: name,
							path: normalizedPath,
							...(ref && { ref })
						})
				);

				if ('sha' in data) {
					sha = data.sha;
				}
			} catch {
				// Create if missing.
			}

			await instrumentGitHubRepositoryRequest(
				repoKey,
				'writeTextFile',
				normalizedPath,
				ref ?? null,
				() =>
					octokit.rest.repos.createOrUpdateFileContents({
						owner,
						repo: name,
						path: normalizedPath,
						message: options?.message || `Update ${normalizedPath} via Tentman CMS`,
						content: Buffer.from(content).toString('base64'),
						...(sha && { sha }),
						...(ref && { branch: ref })
					})
			);
			invalidateCachedTextFile(repoKey, normalizedPath, ref ?? null);
		},

		async writeBinaryFile(
			path: string,
			content: Uint8Array,
			options?: RepositoryWriteOptions
		): Promise<void> {
			const ref = readRef(options);
			const normalizedPath = sanitizeRepositoryPath(path);
			await instrumentGitHubRepositoryRequest(
				repoKey,
				'writeBinaryFile',
				normalizedPath,
				ref ?? null,
				() =>
					writeGitHubImage(octokit, owner, name, content, {
						path: normalizedPath,
						branch: ref,
						message: options?.message
					})
			);
			invalidateCachedTextFile(repoKey, normalizedPath, ref ?? null);
		},

		async deleteFile(path: string, options?: RepositoryWriteOptions): Promise<void> {
			const ref = readRef(options);
			const normalizedPath = sanitizeRepositoryPath(path);
			const { data } = await instrumentGitHubRepositoryRequest(
				repoKey,
				'readForDeleteFile',
				normalizedPath,
				ref ?? null,
				() =>
					octokit.rest.repos.getContent({
						owner,
						repo: name,
						path: normalizedPath,
						...(ref && { ref })
					})
			);

			if (!('sha' in data)) {
				throw new Error(`Expected file at ${normalizedPath}`);
			}

			await instrumentGitHubRepositoryRequest(
				repoKey,
				'deleteFile',
				normalizedPath,
				ref ?? null,
				() =>
					octokit.rest.repos.deleteFile({
						owner,
						repo: name,
						path: normalizedPath,
						message: options?.message || `Delete ${normalizedPath} via Tentman CMS`,
						sha: data.sha,
						...(ref && { branch: ref })
					})
			);
			invalidateCachedTextFile(repoKey, normalizedPath, ref ?? null);
		},

		async commitChanges(
			changes: RepositoryFileChange[],
			options?: RepositoryWriteOptions
		): Promise<void> {
			const ref = readRef(options) ?? repository.default_branch;
			const normalizedChanges = dedupeChanges(changes);
			if (normalizedChanges.length === 0) {
				return;
			}

			const { data: headRef } = await instrumentGitHubRepositoryRequest(
				repoKey,
				'getBatchCommitRef',
				'<ref>',
				ref ?? null,
				() =>
					octokit.rest.git.getRef({
						owner,
						repo: name,
						ref: `heads/${ref}`
					})
			);
			const headSha = headRef.object.sha;
			const { data: headCommit } = await instrumentGitHubRepositoryRequest(
				repoKey,
				'getBatchCommit',
				'<commit>',
				ref ?? null,
				() =>
					octokit.rest.git.getCommit({
						owner,
						repo: name,
						commit_sha: headSha
					})
			);
			const tree = await Promise.all(
				normalizedChanges.map(async (change) => {
					if (change.type === 'delete') {
						return {
							path: change.path,
							mode: '100644' as const,
							type: 'blob' as const,
							sha: null
						};
					}

					const isBinary = change.type === 'writeBinary';
					const content = isBinary
						? Buffer.from(change.content).toString('base64')
						: change.content;
					const { data: blob } = await instrumentGitHubRepositoryRequest(
						repoKey,
						'createBatchBlob',
						change.path,
						ref ?? null,
						() =>
							octokit.rest.git.createBlob({
								owner,
								repo: name,
								content,
								encoding: isBinary ? 'base64' : 'utf-8'
							})
					);

					return {
						path: change.path,
						mode: '100644' as const,
						type: 'blob' as const,
						sha: blob.sha
					};
				})
			);
			const { data: nextTree } = await instrumentGitHubRepositoryRequest(
				repoKey,
				'createBatchTree',
				'<tree>',
				ref ?? null,
				() =>
					octokit.rest.git.createTree({
						owner,
						repo: name,
						base_tree: headCommit.tree.sha,
						tree
					})
			);
			const { data: nextCommit } = await instrumentGitHubRepositoryRequest(
				repoKey,
				'createBatchCommit',
				'<commit>',
				ref ?? null,
				() =>
					octokit.rest.git.createCommit({
						owner,
						repo: name,
						message: options?.message || 'Update files via Tentman CMS',
						tree: nextTree.sha,
						parents: [headSha]
					})
			);

			await instrumentGitHubRepositoryRequest(repoKey, 'updateBatchRef', '<ref>', ref ?? null, () =>
				octokit.rest.git.updateRef({
					owner,
					repo: name,
					ref: `heads/${ref}`,
					sha: nextCommit.sha
				})
			);
			for (const change of normalizedChanges) {
				invalidateCachedTextFile(repoKey, change.path, ref ?? null);
			}
		},

		async listDirectory(path: string, options?: RepositoryReadOptions): Promise<RepoEntry[]> {
			const ref = readRef(options);
			const normalizedPath = sanitizeRepositoryPath(path);
			const requestPath = normalizedPath || '.';
			const { data } = await instrumentGitHubRepositoryRequest(
				repoKey,
				'listDirectory',
				requestPath,
				ref ?? null,
				() =>
					octokit.rest.repos.getContent({
						owner,
						repo: name,
						path: requestPath,
						...(ref && { ref })
					})
			);

			if (!Array.isArray(data)) {
				throw new Error(`Expected directory at ${normalizedPath || '.'}`);
			}

			return data
				.filter((entry) => entry.type === 'file' || entry.type === 'dir')
				.map((entry) => ({
					name: entry.name,
					path: entry.path,
					kind: entry.type === 'dir' ? 'directory' : 'file'
				}));
		},

		async fileExists(path: string, options?: RepositoryReadOptions): Promise<boolean> {
			const ref = readRef(options);
			const normalizedPath = sanitizeRepositoryPath(path);
			try {
				await instrumentGitHubRepositoryRequest(
					repoKey,
					'fileExists',
					normalizedPath,
					ref ?? null,
					() =>
						octokit.rest.repos.getContent({
							owner,
							repo: name,
							path: normalizedPath,
							...(ref && { ref })
						})
				);
				return true;
			} catch (error) {
				if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
					return false;
				}

				throw error;
			}
		}
	};
}
