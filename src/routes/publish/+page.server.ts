import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
		throw redirect(302, '/auth/login?redirect=/publish');
	}

	const { owner, name } = locals.selectedRepo;

	// List preview branches
	const { listPreviewBranches } = await import('$lib/github/branch');
	const branches = await listPreviewBranches(locals.octokit, owner, name);

	if (branches.length === 0) {
		throw error(404, 'No draft branch found');
	}

	// Use the most recent branch
	const draftBranch = branches[0];

	// Get all configs
	const { getCachedConfigs } = await import('$lib/stores/config-cache');
	const configs = await getCachedConfigs(locals.octokit, owner, name);

	// For each config, check if it has draft changes
	const configsWithChanges = [];

	for (const config of configs) {
		const { compareDraftToBranch } = await import('$lib/utils/draft-comparison');
		const changes = await compareDraftToBranch(
			locals.octokit,
			owner,
			name,
			config.config,
			config.type,
			config.path,
			draftBranch.name
		);

		if (
			changes &&
			(changes.modified.length > 0 || changes.created.length > 0 || changes.deleted.length > 0)
		) {
			configsWithChanges.push({
				config,
				changes
			});
		}
	}

	// Get commit history
	const { getCommitsSince } = await import('$lib/github/branch');
	const commits = await getCommitsSince(locals.octokit, owner, name, 'main', draftBranch.name);

	return {
		draftBranch,
		configsWithChanges,
		commits
	};
};

export const actions = {
	publish: async ({ locals }) => {
		if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
			throw error(401, 'Not authenticated');
		}

		const { owner, name } = locals.selectedRepo;

		// Get the draft branch
		const { listPreviewBranches } = await import('$lib/github/branch');
		const branches = await listPreviewBranches(locals.octokit, owner, name);

		if (branches.length === 0) {
			throw error(400, 'No draft branch to publish');
		}

		const draftBranch = branches[0];

		try {
			// Merge to main
			const { mergeBranch } = await import('$lib/github/branch');
			await mergeBranch(
				locals.octokit,
				owner,
				name,
				draftBranch.name,
				'main',
				`Publish draft changes from ${draftBranch.name}`
			);

			// Delete branch
			const { deleteBranch } = await import('$lib/github/branch');
			await deleteBranch(locals.octokit, owner, name, draftBranch.name);

			console.log(`✅ Published and deleted draft branch: ${draftBranch.name}`);

			// Invalidate content cache
			const { invalidateContent } = await import('$lib/stores/content-cache');
			invalidateContent(owner, name);

			throw redirect(303, '/pages?merged=true');
		} catch (err) {
			// Re-throw redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}
			console.error('Failed to publish draft:', err);
			throw error(500, 'Failed to publish changes');
		}
	},

	discard: async ({ locals }) => {
		if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
			throw error(401, 'Not authenticated');
		}

		const { owner, name } = locals.selectedRepo;

		// Get the draft branch
		const { listPreviewBranches } = await import('$lib/github/branch');
		const branches = await listPreviewBranches(locals.octokit, owner, name);

		if (branches.length === 0) {
			throw error(400, 'No draft branch to discard');
		}

		const draftBranch = branches[0];

		try {
			// Delete branch without merging
			const { deleteBranch } = await import('$lib/github/branch');
			await deleteBranch(locals.octokit, owner, name, draftBranch.name);

			console.log(`✅ Discarded draft branch: ${draftBranch.name}`);

			throw redirect(303, '/pages?cancelled=true');
		} catch (err) {
			// Re-throw redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}
			console.error('Failed to discard draft:', err);
			throw error(500, 'Failed to discard draft');
		}
	}
} satisfies Actions;
