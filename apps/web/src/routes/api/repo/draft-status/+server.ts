// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { compareDraftToBranch } from '$lib/utils/draft-comparison';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireDiscoveredConfig } from '$lib/server/page-context';
import { getDraftChangeIndex } from '$lib/server/repository-data';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	if (!slug) {
		throw error(400, 'Missing page slug');
	}

	const requestContext = { locals, cookies };

	try {
		const { octokit, owner, name, defaultBranch, discoveredConfig } = await requireDiscoveredConfig(
			requestContext,
			slug,
			`/pages/${slug}`
		);

		let draftBranch = null;
		let draftChanges = null;

		try {
			draftBranch = await getTentmanDraftBranchName(octokit, owner, name);
			if (draftBranch) {
				const draftChangeIndex = await getDraftChangeIndex({
					octokit,
					owner,
					repo: name,
					baseBranch: defaultBranch,
					draftBranch,
					configs: [discoveredConfig]
				});
				const changeScope = draftChangeIndex.byConfigSlug.get(discoveredConfig.slug);

				if (changeScope && !changeScope.requiresFullFetch) {
					draftChanges = {
						modified: changeScope.modified.map((itemId) => ({ itemId })),
						created: changeScope.created.map((itemId) => ({ itemId })),
						deleted: changeScope.deleted.map((itemId) => ({ itemId })),
						metadata: draftChangeIndex.metadata
					};
				} else {
					draftChanges = await compareDraftToBranch(
						octokit,
						owner,
						name,
						defaultBranch,
						discoveredConfig.config,
						discoveredConfig.path,
						draftBranch
					);
				}
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
