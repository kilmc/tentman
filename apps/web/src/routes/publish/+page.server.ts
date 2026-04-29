// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, error } from '@sveltejs/kit';
import type { Actions } from './$types';
import { handleGitHubRouteError, requireGitHubRepository } from '$lib/server/page-context';

export const actions = {
	publish: async ({ locals, cookies }) => {
		const requestContext = { locals, cookies };
		const { octokit, owner, name, backend } = requireGitHubRepository(requestContext);

		// Get the draft branch
		const { listPreviewBranches } = await import('$lib/github/branch');
		const branches = await listPreviewBranches(octokit, owner, name);

		if (branches.length === 0) {
			throw error(400, 'No draft branch to publish');
		}

		const draftBranch = branches[0];

		try {
			// Merge to main
			const { mergeBranch } = await import('$lib/github/branch');
			await mergeBranch(
				octokit,
				owner,
				name,
				draftBranch.name,
				'main',
				`Publish draft changes from ${draftBranch.name}`
			);

			// Delete branch
			const { deleteBranch } = await import('$lib/github/branch');
			await deleteBranch(octokit, owner, name, draftBranch.name);

			console.log(`✅ Published and deleted draft branch: ${draftBranch.name}`);

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

		// Get the draft branch
		const { listPreviewBranches } = await import('$lib/github/branch');
		const branches = await listPreviewBranches(octokit, owner, name);

		if (branches.length === 0) {
			throw error(400, 'No draft branch to discard');
		}

		const draftBranch = branches[0];

		try {
			// Delete branch without merging
			const { deleteBranch } = await import('$lib/github/branch');
			await deleteBranch(octokit, owner, name, draftBranch.name);

			console.log(`✅ Discarded draft branch: ${draftBranch.name}`);

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
