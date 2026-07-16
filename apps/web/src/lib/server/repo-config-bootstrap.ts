import { error } from '@sveltejs/kit';
import {
	normalizeRepoConfigsBootstrap,
	type RepoBootstrapIdentity,
	type RepoConfigsBootstrap,
	type RepoFreshnessIdentityResult
} from '$lib/repository/config-bootstrap';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { getRepositorySnapshot } from '$lib/server/repository-data';
import {
	canUseGitHubSource,
	getRepositoryRefIdentity,
	getRepositoryTree
} from '$lib/server/repository-data/source';
import type { RepositoryRefIdentity, RepositoryTree } from '$lib/server/repository-data/types';
import { resolveConfigPath } from '$lib/utils/validation';

export interface SelectedGitHubRepoBootstrapContext extends RepoConfigsBootstrap {
	backend: Awaited<ReturnType<typeof requireGitHubContentRepository>>['backend'];
	draftBranch: string | null;
}

export interface RepoConfigsFreshnessInput {
	previousRef?: string | null;
	previousHeadSha?: string | null;
	previousTreeSha?: string | null;
}

function getChangedTreePaths(previousTree: RepositoryTree, nextTree: RepositoryTree): string[] {
	const previousEntries = new Map(
		previousTree.entries
			.filter((entry) => entry.type === 'blob')
			.map((entry) => [entry.path, entry.sha] as const)
	);
	const nextEntries = new Map(
		nextTree.entries
			.filter((entry) => entry.type === 'blob')
			.map((entry) => [entry.path, entry.sha] as const)
	);
	const changedPaths = new Set<string>();

	for (const [path, sha] of previousEntries) {
		if (nextEntries.get(path) !== sha) {
			changedPaths.add(path);
		}
	}
	for (const path of nextEntries.keys()) {
		if (!previousEntries.has(path)) {
			changedPaths.add(path);
		}
	}

	return [...changedPaths].sort();
}

function getSingletonContentIdentities(
	snapshot: Awaited<ReturnType<typeof getRepositorySnapshot>>
): RepoConfigsBootstrap['singletonContentIdentities'] {
	if (!snapshot.tree) {
		return {};
	}

	const blobEntries = new Map(
		snapshot.tree.entries
			.filter((entry) => entry.type === 'blob')
			.map((entry) => [entry.path, entry.sha] as const)
	);
	const identities: RepoConfigsBootstrap['singletonContentIdentities'] = {};
	for (const config of snapshot.configIndex.configs) {
		if (
			config.config.collection ||
			config.config.content.mode !== 'file' ||
			typeof config.config.content.path !== 'string'
		) {
			continue;
		}

		const path = resolveConfigPath(config.path, config.config.content.path);
		const blobSha = blobEntries.get(path);
		if (!blobSha) {
			continue;
		}

		identities[config.slug] = { path, blobSha };
	}

	return identities;
}

function isGitHubNotFoundError(error: unknown): boolean {
	return Boolean(error && typeof error === 'object' && 'status' in error && error.status === 404);
}

async function loadChangedPaths(input: {
	backend: SelectedGitHubRepoBootstrapContext['backend'];
	currentTree: RepositoryTree | undefined;
	currentIdentity: RepoBootstrapIdentity;
	previousRef?: string | null;
	previousHeadSha?: string | null;
	previousTreeSha?: string | null;
}): Promise<string[] | null> {
	if (
		!input.previousTreeSha ||
		input.previousTreeSha === input.currentIdentity.treeSha ||
		!input.currentTree ||
		!canUseGitHubSource(input.backend)
	) {
		return null;
	}

	const previousIdentity: RepositoryRefIdentity = {
		mode: 'github',
		repoKey: input.currentIdentity.repoKey,
		label: input.currentIdentity.label,
		ref: input.previousRef ?? input.currentIdentity.ref,
		headSha: input.previousHeadSha ?? input.previousTreeSha,
		treeSha: input.previousTreeSha,
		resolvedAt: input.currentIdentity.resolvedAt
	};
	let previousTree: RepositoryTree;
	try {
		previousTree = await getRepositoryTree(input.backend, previousIdentity);
	} catch (error) {
		if (isGitHubNotFoundError(error)) {
			return null;
		}
		throw error;
	}

	return getChangedTreePaths(previousTree, input.currentTree);
}

function matchesPreviousFreshnessIdentity(
	identity: RepoBootstrapIdentity | null | undefined,
	freshness?: RepoConfigsFreshnessInput
): boolean {
	if (!freshness?.previousRef || !freshness.previousHeadSha || !freshness.previousTreeSha) {
		return false;
	}

	return (
		identity?.ref === freshness.previousRef &&
		identity?.headSha === freshness.previousHeadSha &&
		identity?.treeSha === freshness.previousTreeSha
	);
}

export async function loadSelectedGitHubRepoFreshness(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>,
	freshness?: RepoConfigsFreshnessInput
): Promise<RepoFreshnessIdentityResult> {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const { backend, draftBranch, repo } = await requireGitHubContentRepository({ locals, cookies });
	const mainBackend = draftBranch ? createGitHubRepositoryBackend(backend.octokit, repo) : backend;
	const [activeIdentity, mainIdentity] = await Promise.all([
		getRepositoryRefIdentity(backend, draftBranch),
		draftBranch ? getRepositoryRefIdentity(mainBackend) : Promise.resolve(null)
	]);
	const activeIdentityUnchanged = matchesPreviousFreshnessIdentity(activeIdentity, freshness);
	const mainIdentityUnchanged = draftBranch
		? true
		: matchesPreviousFreshnessIdentity(mainIdentity ?? activeIdentity, freshness);
	const draftIdentityUnchanged = draftBranch
		? matchesPreviousFreshnessIdentity(activeIdentity, freshness)
		: true;

	return {
		activeDraftBranch: draftBranch,
		repositoryIdentity: activeIdentity,
		mainRepositoryIdentity: mainIdentity ?? (draftBranch ? null : activeIdentity),
		draftRepositoryIdentity: draftBranch ? activeIdentity : null,
		unchanged: activeIdentityUnchanged && mainIdentityUnchanged && draftIdentityUnchanged,
		changedPaths: null
	};
}

export async function loadSelectedGitHubRepoBootstrapContext(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>,
	freshness?: RepoConfigsFreshnessInput
): Promise<SelectedGitHubRepoBootstrapContext> {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const { backend, draftBranch, repo } = await requireGitHubContentRepository({ locals, cookies });
	const mainBackend = draftBranch ? createGitHubRepositoryBackend(backend.octokit, repo) : backend;
	const [snapshot, mainSnapshot] = await Promise.all([
		getRepositorySnapshot({ backend, ref: draftBranch }),
		draftBranch ? getRepositorySnapshot({ backend: mainBackend }) : Promise.resolve(null)
	]);
	const changedPaths = await loadChangedPaths({
		backend,
		currentTree: snapshot.tree,
		currentIdentity: snapshot.identity,
		previousRef: freshness?.previousRef,
		previousHeadSha: freshness?.previousHeadSha,
		previousTreeSha: freshness?.previousTreeSha
	});

	return {
		backend,
		draftBranch,
		...normalizeRepoConfigsBootstrap({
			configs: snapshot.configIndex.configs,
			blockConfigs: snapshot.blockConfigIndex.configs,
			rootConfig: snapshot.rootConfig,
			singletonContentIdentities: getSingletonContentIdentities(snapshot),
			activeDraftBranch: draftBranch,
			navigationManifest: snapshot.navigationManifest,
			repositoryIdentity: snapshot.identity,
			mainRepositoryIdentity: mainSnapshot?.identity ?? (draftBranch ? null : snapshot.identity),
			draftRepositoryIdentity: draftBranch ? snapshot.identity : null,
			changedPaths
		})
	};
}

export async function loadSelectedGitHubRepoConfigs(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>,
	freshness?: RepoConfigsFreshnessInput
): Promise<RepoConfigsBootstrap> {
	const {
		backend: _backend,
		draftBranch: _draftBranch,
		...bootstrap
	} = await loadSelectedGitHubRepoBootstrapContext(locals, cookies, freshness);
	return bootstrap;
}
