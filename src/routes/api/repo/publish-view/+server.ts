// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCommitsSince, listPreviewBranches } from '$lib/github/branch';
import { getCachedConfigs } from '$lib/stores/config-cache';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubRepository } from '$lib/server/page-context';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const requestContext = { locals, cookies };

	try {
		const { octokit, owner, name, backend } = requireGitHubRepository(requestContext, '/publish');
		const branches = await listPreviewBranches(octokit, owner, name);

		if (branches.length === 0) {
			throw error(404, 'No draft branch found');
		}

		const draftBranch = branches[0];
		const configs = await getCachedConfigs(backend);
		const configsWithChanges = [];

		for (const config of configs) {
			const changes = await compareDraftToBranch(
				octokit,
				owner,
				name,
				config.config,
				config.path,
				draftBranch.name
			);

			if (
				changes.modified.length > 0 ||
				changes.created.length > 0 ||
				changes.deleted.length > 0
			) {
				configsWithChanges.push({
					config,
					changes
				});
			}
		}

		const commits = await getCommitsSince(octokit, owner, name, 'main', draftBranch.name);

		return json({
			draftBranch,
			configsWithChanges,
			commits
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error('Failed to load publish view:', err);
		throw error(500, 'Failed to load publish view');
	}
};
