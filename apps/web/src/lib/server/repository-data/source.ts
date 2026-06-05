import type { GitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import type {
	RepositoryRefIdentity,
	RepositorySourceIdentity,
	RepositoryTree,
	RepositoryTreeEntry
} from './types';

const UNKNOWN_TREE_SHA = 'unknown-tree';
const textBlobCache = new Map<string, string>();
const textBlobInflight = new Map<string, Promise<string>>();

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
		const branch = await backend.octokit.rest.repos.getBranch({
			owner: backend.owner,
			repo: backend.repo,
			branch: ref
		});
		const commitSha = branch.data.commit.sha;
		const commit = await backend.octokit.rest.git.getCommit({
			owner: backend.owner,
			repo: backend.repo,
			commit_sha: commitSha
		});

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
	const { data } = await backend.octokit.rest.git.getTree({
		owner: backend.owner,
		repo: backend.repo,
		tree_sha: identity.treeSha,
		recursive: 'true'
	});
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
		return cached;
	}

	const pending = textBlobInflight.get(cacheKey);
	if (pending) {
		return pending;
	}

	const start = performance.now();
	const promise = backend.octokit.rest.git
		.getBlob({
			owner: backend.owner,
			repo: backend.repo,
			file_sha: sha
		})
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
