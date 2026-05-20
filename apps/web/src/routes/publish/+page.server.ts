// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, error } from '@sveltejs/kit';
import type { Actions } from './$types';
import {
	discardDraftBranch,
	publishDraftBranch
} from '$lib/features/draft-publishing/service';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';

export const actions = {
	publish: async ({ locals, cookies }) => {
		const requestContext = { locals, cookies };
		const { octokit, owner, name, backend } = requireGitHubRepository(requestContext);

		try {
			const { branchName } = await publishDraftBranch(octokit, owner, name);

			console.log(`✅ Published and deleted draft branch: ${branchName}`);

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

		try {
			const { branchName } = await discardDraftBranch(octokit, owner, name);

			console.log(`✅ Discarded draft branch: ${branchName}`);

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
