// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireDiscoveredConfig } from '$lib/server/page-context';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing page slug');
	}

	const requestContext = { locals, cookies };

	try {
		const { octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
			requestContext,
			slug,
			`/pages/${slug}`
		);

		let draftBranch = null;
		let draftChanges = null;

		try {
			draftBranch = await getLatestPreviewBranchName(octokit, owner, name);
			if (draftBranch) {
				draftChanges = await compareDraftToBranch(
					octokit,
					owner,
					name,
					discoveredConfig.config,
					discoveredConfig.path,
					draftBranch
				);
			}
		} catch (err) {
			handleGitHubSessionError({ cookies }, err);
			console.error(`[DRAFT STATUS ${slug}] Failed to check draft state:`, err);
			draftBranch = null;
			draftChanges = null;
		}

		return json({
			draftBranch,
			draftChanges
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error(`Failed to load draft status for ${slug}:`, err);
		throw error(500, 'Failed to load draft status');
	}
};
