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
import { normalizeGitHubPath } from '$lib/utils/validation';

interface CachedMetadataEntry<T> {
	value: T;
	timestamp: number;
}

interface GitHubRepositoryRequestStat {
	repoKey: string;
	operation: string;
	path: string;
	ref: string | null;
	count: number;
	totalDurationMs: number;
	lastDurationMs: number;
	lastUpdatedAt: number;
}

const METADATA_CACHE_TTL = 60 * 1000;
const rootConfigCache = new Map<string, CachedMetadataEntry<RootConfig | null>>();
const rootConfigInflight = new Map<string, Promise<RootConfig | null>>();
const blockConfigCache = new Map<string, CachedMetadataEntry<DiscoveredBlockConfig[]>>();
const blockConfigInflight = new Map<string, Promise<DiscoveredBlockConfig[]>>();
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
	return Boolean(import.meta.env?.DEV);
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
	path: string,
	ref: string | null,
	durationMs: number
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
				lastUpdatedAt: Date.now()
			}
		: {
				repoKey,
				operation,
				path,
				ref,
				count: 1,
				totalDurationMs: durationMs,
				lastDurationMs: durationMs,
				lastUpdatedAt: Date.now()
			};

	githubRepositoryRequestStats.set(statKey, nextStat);
	console.log('[GITHUB REPO REQUEST]', {
		repoKey,
		operation,
		path,
		ref,
		durationMs: Number(durationMs.toFixed(1)),
		count: nextStat.count
	});
}

async function instrumentGitHubRepositoryRequest<T>(
	repoKey: string,
	operation: string,
	path: string,
	ref: string | null,
	action: () => Promise<T>
): Promise<T> {
	const start = performance.now();
	try {
		return await action();
	} finally {
		recordGitHubRepositoryRequestStat(repoKey, operation, path, ref, performance.now() - start);
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

			await instrumentGitHubRepositoryRequest(
				repoKey,
				'updateBatchRef',
				'<ref>',
				ref ?? null,
				() =>
					octokit.rest.git.updateRef({
						owner,
						repo: name,
						ref: `heads/${ref}`,
						sha: nextCommit.sha
					})
			);
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
