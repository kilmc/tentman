import { error } from '@sveltejs/kit';
import {
	normalizeRepoConfigsBootstrap,
	type RepoBootstrapIdentity,
	type RepoConfigsBootstrap,
	type RepoFreshnessIdentityResult
} from '$lib/repository/config-bootstrap';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import {
	createWorkflowRouteDataIdentity,
	createWorkflowWorkspaceBootstrapData,
	type WorkflowWorkspaceBootstrapData
} from '$lib/repository/workflow-data';
import { requireGitHubContentRepository } from '$lib/server/page-context';
import { getRepositorySnapshot } from '$lib/server/repository-data';
import {
	resolveLegacySingletonConfigStatesForRoute,
	resolveIndexedSingletonConfigStatesForRoute,
	type ResolvedSingletonConfigStates
} from '$lib/server/repository-data/route-data';
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

export interface SelectedGitHubRepoWorkflowBootstrap extends RepoConfigsBootstrap {
	workflowData: WorkflowWorkspaceBootstrapData;
}

export interface RepoConfigsFreshnessInput {
	previousRef?: string | null;
	previousHeadSha?: string | null;
	previousTreeSha?: string | null;
}

type FreshnessStatus = NonNullable<RepoFreshnessIdentityResult['freshnessStatus']>;

interface ChangedPathsResult {
	status: FreshnessStatus;
	changedPaths: string[] | null;
	error?: string | null;
	recovery?: string | null;
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

function createMissingPreviousIdentityResult(): ChangedPathsResult {
	return {
		status: 'stale',
		changedPaths: null,
		error: 'The previous GitHub tree is no longer available, so Tentman could not derive exact changed paths.',
		recovery: 'Refresh stale GitHub cache records to reload route data from the current repository identity.'
	};
}

function createChangedPathErrorResult(error: unknown): ChangedPathsResult {
	return {
		status: 'error',
		changedPaths: null,
		error: error instanceof Error ? error.message : 'Failed to derive changed GitHub paths.',
		recovery: 'Refresh errored GitHub cache records after the repository is reachable again.'
	};
}

async function loadChangedPaths(input: {
	backend: SelectedGitHubRepoBootstrapContext['backend'];
	currentTree: RepositoryTree | undefined;
	currentIdentity: RepoBootstrapIdentity;
	previousRef?: string | null;
	previousHeadSha?: string | null;
	previousTreeSha?: string | null;
}): Promise<ChangedPathsResult> {
	if (
		!input.previousTreeSha ||
		input.previousTreeSha === input.currentIdentity.treeSha ||
		!input.currentTree ||
		!canUseGitHubSource(input.backend)
	) {
		return { status: 'unchanged', changedPaths: null };
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
			return createMissingPreviousIdentityResult();
		}
		return createChangedPathErrorResult(error);
	}

	return {
		status: 'changed',
		changedPaths: getChangedTreePaths(previousTree, input.currentTree)
	};
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
	const unchanged = activeIdentityUnchanged && mainIdentityUnchanged && draftIdentityUnchanged;
	let changedPathsResult: ChangedPathsResult = { status: 'unchanged', changedPaths: null };
	if (!unchanged && canUseGitHubSource(backend)) {
		try {
			const currentTree = await getRepositoryTree(backend, activeIdentity);
			changedPathsResult = await loadChangedPaths({
				backend,
				currentTree,
				currentIdentity: activeIdentity,
				previousRef: freshness?.previousRef,
				previousHeadSha: freshness?.previousHeadSha,
				previousTreeSha: freshness?.previousTreeSha
			});
		} catch (error) {
			changedPathsResult = isGitHubNotFoundError(error)
				? createMissingPreviousIdentityResult()
				: createChangedPathErrorResult(error);
		}
	}

	return {
		activeDraftBranch: draftBranch,
		repositoryIdentity: activeIdentity,
		mainRepositoryIdentity: mainIdentity ?? (draftBranch ? null : activeIdentity),
		draftRepositoryIdentity: draftBranch ? activeIdentity : null,
		unchanged,
		freshnessStatus: unchanged ? 'unchanged' : changedPathsResult.status,
		changedPaths: changedPathsResult.changedPaths,
		error: changedPathsResult.error ?? null,
		recovery: changedPathsResult.recovery ?? null
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
	const changedPathsResult = await loadChangedPaths({
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
			changedPaths: changedPathsResult.changedPaths,
			freshnessStatus: changedPathsResult.status,
			freshnessError: changedPathsResult.error ?? null,
			freshnessRecovery: changedPathsResult.recovery ?? null
		})
	};
}

export async function loadSelectedGitHubRepoWorkflowBootstrap(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>,
	freshness?: RepoConfigsFreshnessInput
): Promise<SelectedGitHubRepoWorkflowBootstrap> {
	const {
		backend: _backend,
		draftBranch: _draftBranch,
		...bootstrap
	} = await loadSelectedGitHubRepoBootstrapContext(locals, cookies, freshness);
	return {
		...bootstrap,
		workflowData: createWorkflowWorkspaceBootstrapData(bootstrap)
	};
}

export async function loadSelectedGitHubRepoConfigStates(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>
): Promise<ResolvedSingletonConfigStates> {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const { backend, draftBranch } = await requireGitHubContentRepository({ locals, cookies });
	const indexedStates = await resolveIndexedSingletonConfigStatesForRoute({
		backend,
		hasEditableDraft: Boolean(draftBranch)
	});

	if (indexedStates) {
		return indexedStates;
	}

	const bootstrap = await loadSelectedGitHubRepoBootstrapContext(locals, cookies);
	return resolveLegacySingletonConfigStatesForRoute({
		backend: bootstrap.backend,
		workflowIdentity: createWorkflowRouteDataIdentity(bootstrap.repositoryIdentity, {
			hasEditableDraft: Boolean(bootstrap.draftBranch)
		}),
		configs: bootstrap.configs,
		rootConfig: bootstrap.rootConfig
	});
}

export async function loadSelectedGitHubRepoConfigs(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>,
	freshness?: RepoConfigsFreshnessInput
): Promise<RepoConfigsBootstrap> {
	return loadSelectedGitHubRepoWorkflowBootstrap(locals, cookies, freshness);
}
