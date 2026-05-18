// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, error } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { closeDraftPullRequest, ensureDraftPullRequest } from '$lib/github/pull-request';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';

export const actions = {
	publish: async ({ locals, cookies }) => {
		const requestContext = { locals, cookies };
		const { octokit, owner, name, backend } = requireGitHubRepository(requestContext);

		const draftBranch = await getLatestPreviewBranchName(octokit, owner, name);
		if (!draftBranch) {
			throw error(400, 'No draft branch to publish');
		}

		try {
			const pullRequest = await ensureDraftPullRequest(octokit, owner, name, draftBranch);
			await octokit.rest.pulls.merge({
				owner,
				repo: name,
				pull_number: pullRequest.number,
				commit_title: 'Publish Tentman draft changes'
			});

			const { deleteBranch } = await import('$lib/github/branch');
			await deleteBranch(octokit, owner, name, draftBranch);

			console.log(`✅ Published and deleted draft branch: ${draftBranch}`);

			// Invalidate content cache
			const { invalidateContent } = await import('$lib/stores/content-cache');
			invalidateContent(backend.cacheKey);

			throw redirect(303, '/pages?merged=true');
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
		const { octokit, owner, name } = requireGitHubRepository(requestContext);

		const draftBranch = await getLatestPreviewBranchName(octokit, owner, name);
		if (!draftBranch) {
			throw error(400, 'No draft branch to discard');
		}

		try {
			await closeDraftPullRequest(octokit, owner, name, draftBranch);
			const { deleteBranch } = await import('$lib/github/branch');
			await deleteBranch(octokit, owner, name, draftBranch);

			console.log(`✅ Discarded draft branch: ${draftBranch}`);

			throw redirect(303, '/pages?cancelled=true');
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
