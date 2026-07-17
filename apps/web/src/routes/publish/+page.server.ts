// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, error } from '@sveltejs/kit';
import type { Actions } from './$types';
import {
	discardDraftBranch,
	getTentmanDraftBranchName,
	publishDraftBranch
} from '$lib/features/draft-publishing/service';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';
import {
	getDraftChangeIndex,
	getRepositorySnapshot,
	invalidateRepositoryData
} from '$lib/server/repository-data';
import { createWorkflowMutationResult } from '$lib/repository/workflow-mutations';

async function getPublishChangedPaths(input: {
	octokit: ReturnType<typeof requireGitHubRepository>['octokit'];
	owner: string;
	name: string;
	backend: ReturnType<typeof requireGitHubRepository>['backend'];
	defaultBranch: string;
}): Promise<string[] | undefined> {
	try {
		const draftBranch = await getTentmanDraftBranchName(input.octokit, input.owner, input.name);
		if (!draftBranch) {
			return undefined;
		}

		const snapshot = await getRepositorySnapshot({
			backend: input.backend,
			ref: input.defaultBranch
		});
		const configs = snapshot.configIndex.configs;
		const changeIndex = await getDraftChangeIndex({
			octokit: input.octokit,
			owner: input.owner,
			repo: input.name,
			baseBranch: input.defaultBranch,
			draftBranch,
			configs
		});

		const changedPaths = new Set<string>();
		for (const file of changeIndex.files) {
			changedPaths.add(file.filename);
			if (file.previous_filename) {
				changedPaths.add(file.previous_filename);
			}
		}

		return [...changedPaths];
	} catch (err) {
		console.warn('Could not scope repository-data publish invalidation:', err);
		return undefined;
	}
}

export const actions = {
	publish: async ({ locals, cookies }) => {
		const requestContext = { locals, cookies };
		const { octokit, owner, name, backend, defaultBranch } =
			requireGitHubRepository(requestContext);

		try {
			const changedPaths = await getPublishChangedPaths({
				octokit,
				owner,
				name,
				backend,
				defaultBranch
			});
			const { branchName } = await publishDraftBranch(octokit, owner, name, defaultBranch);

			console.log(`✅ Published and deleted draft branch: ${branchName}`);

			// Invalidate bootstrap/content caches after merging draft changes into main.
			const { invalidateContent } = await import('$lib/stores/content-cache');
			const { invalidateCache } = await import('$lib/stores/config-cache');
			const { invalidateGitHubRepositoryMetadataCache } = await import('$lib/repository/github');
			const { invalidateNavigationManifestStateCache } =
				await import('$lib/features/content-management/navigation-manifest');
			invalidateCache(backend.cacheKey);
			invalidateContent(backend.cacheKey);
			invalidateGitHubRepositoryMetadataCache(backend.cacheKey);
			invalidateNavigationManifestStateCache(backend);
			invalidateRepositoryData({
				backend,
				ref: defaultBranch,
				changedPaths,
				reason: 'publish'
			});

			const mutation = createWorkflowMutationResult({
				mode: 'github',
				intent: {
					type: 'publish-draft'
				},
				outcome: changedPaths ? 'success' : 'degraded',
				degradedReason: changedPaths ? null : 'Could not scope changed paths before publishing.',
				message: 'Draft published.',
				changedPaths,
				redirect: {
					href: '/pages?merged=true'
				},
				refresh: {
					workspace: true,
					cachePaths: changedPaths ?? []
				}
			});

			throw redirect(
				mutation.redirect?.status ?? 303,
				mutation.redirect?.href ?? '/pages?merged=true'
			);
		} catch (err) {
			handleGitHubRouteError(requestContext, err, '/publish');
			// Re-throw redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}
			console.error('Failed to publish draft:', err);
			throw error(500, 'Failed to publish changes');
		}
	},

	discard: async ({ locals, cookies }) => {
		const requestContext = { locals, cookies };
		const { octokit, owner, name, backend, defaultBranch } =
			requireGitHubRepository(requestContext);

		try {
			const { branchName } = await discardDraftBranch(octokit, owner, name, defaultBranch);

			console.log(`✅ Discarded draft branch: ${branchName}`);
			invalidateRepositoryData({
				backend,
				ref: branchName,
				reason: 'discard'
			});

			const mutation = createWorkflowMutationResult({
				mode: 'github',
				intent: {
					type: 'discard-draft'
				},
				message: 'Draft discarded.',
				redirect: {
					href: '/pages?cancelled=true'
				},
				refresh: {
					workspace: true
				}
			});

			throw redirect(
				mutation.redirect?.status ?? 303,
				mutation.redirect?.href ?? '/pages?cancelled=true'
			);
		} catch (err) {
			handleGitHubRouteError(requestContext, err, '/publish');
			// Re-throw redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}
			console.error('Failed to discard draft:', err);
			throw error(500, 'Failed to discard draft');
		}
	}
} satisfies Actions;
