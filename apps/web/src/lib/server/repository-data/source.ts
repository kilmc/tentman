import type { GitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import { recordCacheOutcome, traceGitHubRequest } from '$lib/utils/workflow-instrumentation';
import type {
	RepositoryRefIdentity,
	RepositorySourceIdentity,
	RepositoryTree,
	RepositoryTreeEntry
} from './types';

const UNKNOWN_TREE_SHA = 'unknown-tree';
const MAX_CONCURRENT_GITHUB_TEXT_BLOB_READS = 4;
const textBlobCache = new Map<string, string>();
const textBlobInflight = new Map<string, Promise<string>>();
const textBlobSlotWaiters: Array<() => void> = [];
let activeTextBlobSlots = 0;

function getRefFromBackendCacheKey(backend: RepositoryBackend): string {
	const ref = backend.cacheKey.match(/[?&]ref=([^&]+)/)?.[1];
	return ref ? decodeURIComponent(ref) : 'default';
}

function getRequestedRef(backend: RepositoryBackend, ref?: string | null): string {
	return ref?.trim() || getRefFromBackendCacheKey(backend);
}

function isGitHubBackend(backend: RepositoryBackend): backend is GitHubRepositoryBackend {
	return (
		backend.kind === 'github' && 'octokit' in backend && 'owner' in backend && 'repo' in backend
	);
}

function decodeGitHubBlob(content: string): string {
	return Buffer.from(content, 'base64').toString('utf-8');
}

async function acquireTextBlobSlot(): Promise<() => void> {
	if (activeTextBlobSlots < MAX_CONCURRENT_GITHUB_TEXT_BLOB_READS) {
		activeTextBlobSlots += 1;
		return releaseTextBlobSlot;
	}

	await new Promise<void>((resolve) => {
		textBlobSlotWaiters.push(resolve);
	});
	return releaseTextBlobSlot;
}

function releaseTextBlobSlot(): void {
	const next = textBlobSlotWaiters.shift();
	if (next) {
		next();
		return;
	}

	activeTextBlobSlots = Math.max(0, activeTextBlobSlots - 1);
}

async function withTextBlobSlot<T>(task: () => Promise<T>): Promise<T> {
	const release = await acquireTextBlobSlot();
	try {
		return await task();
	} finally {
		release();
	}
}

export function getRepositorySourceIdentity(backend: RepositoryBackend): RepositorySourceIdentity {
	return {
		mode: backend.kind,
		repoKey: backend.cacheKey,
		label: backend.label
	};
}

async function getGitHubRefIdentity(
	backend: GitHubRepositoryBackend,
	ref: string
): Promise<RepositoryRefIdentity> {
	const source = getRepositorySourceIdentity(backend);

	try {
		const branch = await traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'getRefIdentityBranch',
				requestKind: 'branch',
				repoKey: backend.cacheKey,
				owner: backend.owner,
				repo: backend.repo,
				ref
			},
			() =>
				backend.octokit.rest.repos.getBranch({
					owner: backend.owner,
					repo: backend.repo,
					branch: ref
				})
		);
		const commitSha = branch.data.commit.sha;
		const commit = await traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'getRefIdentityCommit',
				requestKind: 'commit',
				repoKey: backend.cacheKey,
				owner: backend.owner,
				repo: backend.repo,
				ref,
				sha: commitSha
			},
			() =>
				backend.octokit.rest.git.getCommit({
					owner: backend.owner,
					repo: backend.repo,
					commit_sha: commitSha
				})
		);

		return {
			...source,
			ref,
			headSha: commitSha,
			treeSha: commit.data.tree.sha,
			resolvedAt: Date.now()
		};
	} catch {
		return {
			...source,
			ref,
			headSha: `${source.repoKey}:${ref}`,
			treeSha: UNKNOWN_TREE_SHA,
			resolvedAt: Date.now()
		};
	}
}

export async function getRepositoryRefIdentity(
	backend: RepositoryBackend,
	ref?: string | null
): Promise<RepositoryRefIdentity> {
	const requestedRef = getRequestedRef(backend, ref);

	if (isGitHubBackend(backend)) {
		return getGitHubRefIdentity(backend, requestedRef);
	}

	return {
		...getRepositorySourceIdentity(backend),
		ref: requestedRef,
		headSha: `${backend.cacheKey}:${requestedRef}`,
		treeSha: `${backend.cacheKey}:${requestedRef}`,
		resolvedAt: Date.now()
	};
}

export function canUseGitHubSource(backend: RepositoryBackend): backend is GitHubRepositoryBackend {
	return isGitHubBackend(backend);
}

export async function getRepositoryTree(
	backend: GitHubRepositoryBackend,
	identity: RepositoryRefIdentity
): Promise<RepositoryTree> {
	const { data } = await traceGitHubRequest(
		{
			source: 'repository-data',
			operation: 'getRepositoryTree',
			requestKind: 'tree',
			repoKey: backend.cacheKey,
			owner: backend.owner,
			repo: backend.repo,
			ref: identity.ref,
			sha: identity.treeSha
		},
		() =>
			backend.octokit.rest.git.getTree({
				owner: backend.owner,
				repo: backend.repo,
				tree_sha: identity.treeSha,
				recursive: 'true'
			})
	);
	const entries: RepositoryTreeEntry[] = data.tree
		.filter((entry): entry is typeof entry & { path: string; sha: string } =>
			Boolean(entry.path && entry.sha)
		)
		.map((entry) => ({
			path: entry.path,
			sha: entry.sha,
			type: entry.type ?? 'unknown',
			size: entry.size
		}));

	return {
		identity,
		entries,
		truncated: Boolean(data.truncated)
	};
}

export async function readGitHubTextBlob(
	backend: GitHubRepositoryBackend,
	sha: string
): Promise<string> {
	const cacheKey = `${backend.cacheKey}:${sha}`;
	const cached = textBlobCache.get(cacheKey);
	if (cached !== undefined) {
		recordCacheOutcome({
			cacheArea: 'item-document',
			outcome: 'hit',
			reason: 'text blob already decoded in memory',
			repoFullName: backend.fullName,
			key: cacheKey,
			path: sha
		});
		return cached;
	}

	const pending = textBlobInflight.get(cacheKey);
	if (pending) {
		recordCacheOutcome({
			cacheArea: 'item-document',
			outcome: 'hit',
			reason: 'text blob request already in flight',
			repoFullName: backend.fullName,
			key: cacheKey,
			path: sha
		});
		return pending;
	}

	recordCacheOutcome({
		cacheArea: 'item-document',
		outcome: 'miss',
		reason: 'text blob missing from memory cache',
		repoFullName: backend.fullName,
		key: cacheKey,
		path: sha
	});
	const start = performance.now();
	const promise = withTextBlobSlot(() =>
		traceGitHubRequest(
			{
				source: 'repository-data',
				operation: 'readGitHubTextBlob',
				requestKind: 'blob',
				repoKey: backend.cacheKey,
				owner: backend.owner,
				repo: backend.repo,
				sha,
				cacheResult: 'miss',
				dedupeState: 'unique'
			},
			() =>
				backend.octokit.rest.git.getBlob({
					owner: backend.owner,
					repo: backend.repo,
					file_sha: sha
				})
		)
	)
		.then(({ data }) => {
			const decoded = decodeGitHubBlob(data.content);
			textBlobCache.set(cacheKey, decoded);
			logTiming('repository-data.github-blob.load', {
				repoKey: backend.cacheKey,
				sha,
				size: decoded.length,
				durationMs: performance.now() - start
			});
			return decoded;
		})
		.finally(() => {
			textBlobInflight.delete(cacheKey);
		});

	textBlobInflight.set(cacheKey, promise);
	return promise;
}

export function clearGitHubTextBlobCache(): void {
	textBlobCache.clear();
	textBlobInflight.clear();
}
