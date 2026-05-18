// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { saveContentDocument } from '$lib/content/service.js';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { formatErrorMessage, logError } from '$lib/utils/errors.js';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { getRoutePath } from '$lib/utils/routing';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import type { ContentRecord } from '$lib/features/content-management/types';

export const actions: Actions = {
	createPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;

			// Get or create draft branch
			const formBranchName = formData.get('branchName') as string | null;
			const { branchName, created } = await ensureDraftBranch(octokit, owner, name, formBranchName);
			if (created) {
				console.log(`✅ Created draft branch: ${branchName}`);
			}

			const materialized = await materializeDraftAssetsFromFormData({
				formData,
				content: contentData,
				backend,
				writeOptions: {
					ref: branchName
				}
			});

			// Save the content to the draft branch
			await saveContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				materialized.content,
				{
					branch: branchName
				}
			);
			await ensureDraftPullRequest(octokit, owner, name, branchName);

			console.log(`✅ Saved content to ${branchName}`);

			// Redirect back to index page
			throw redirect(
				303,
				`/pages/${params.page}/edit?saved=true&branch=${encodeURIComponent(branchName)}`
			);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			handleGitHubRouteError(requestContext, err, getRoutePath(url));
			logError(err, 'Create draft');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	publishNow: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const requestedBranchName = (formData.get('branchName') as string | null) || undefined;
			const { branchName } = await ensureDraftBranch(octokit, owner, name, requestedBranchName);
			const materialized = await materializeDraftAssetsFromFormData({
				formData,
				content: contentData,
				backend,
				writeOptions: {
					ref: branchName
				}
			});

			await saveContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				materialized.content,
				{
					branch: branchName
				}
			);
			await ensureDraftPullRequest(octokit, owner, name, branchName);

			throw redirect(303, '/publish');
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			handleGitHubRouteError(requestContext, err, getRoutePath(url));
			logError(err, 'Publish now');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
