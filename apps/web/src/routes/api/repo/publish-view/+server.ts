// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTentmanDraftBranchName } from '$lib/features/draft-publishing/service';
import { buildPublishReviewModel } from '$lib/features/review-draft/build-review-model';
import { getBlockedPublishReview } from '$lib/features/review-draft/review-cost-guard';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubRepository } from '$lib/server/page-context';
import { getDraftChangeIndex, getRepositorySnapshot } from '$lib/server/repository-data';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const requestContext = { locals, cookies };

	try {
		const { octokit, owner, name, repo, backend } = requireGitHubRepository(
			requestContext,
			'/publish'
		);
		const draftBranch = await getTentmanDraftBranchName(octokit, owner, name);
		if (!draftBranch) {
			throw error(404, 'No draft branch found');
		}

		const baseSnapshot = await getRepositorySnapshot({ backend, ref: repo.default_branch });
		const configs = baseSnapshot.configIndex.configs;
		const draftChangeIndex = await getDraftChangeIndex({
			octokit,
			owner,
			repo: name,
			baseBranch: repo.default_branch,
			draftBranch,
			configs
		});
		const blockedReview = getBlockedPublishReview({
			configs,
			changedFiles: draftChangeIndex.files
		});
		if (blockedReview) {
			return json(
				{
					draftBranch: {
						name: draftBranch
					},
					blockedReview
				},
				{ status: 413 }
			);
		}

		const reviewModel = await buildPublishReviewModel({
			octokit,
			owner,
			repo,
			backend,
			configs,
			baseBranch: repo.default_branch,
			draftBranch,
			changedFiles: draftChangeIndex.files,
			baseSnapshot
		});

		return json({
			draftBranch: {
				name: draftBranch
			},
			reviewModel
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
