// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createContentDocument } from '$lib/content/service';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import type { ContentRecord } from '$lib/features/content-management/types';

export const actions: Actions = {
	createToPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const requestedBranchName = (formData.get('branch') as string | null) || undefined;
			const newFilename = (formData.get('newFilename') as string | null) || undefined;
			const { branchName } = await ensureDraftBranch(octokit, owner, name, requestedBranchName);
			const materialized = await materializeDraftAssetsFromFormData({
				formData,
				content: contentData,
				backend,
				writeOptions: {
					ref: branchName
				}
			});

			await createContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				materialized.content,
				{
					filename: newFilename,
					branch: branchName
				}
			);
			await ensureDraftPullRequest(octokit, owner, name, branchName);

			const itemId =
				discoveredConfig.config.idField && contentData[discoveredConfig.config.idField]
					? contentData[discoveredConfig.config.idField]
					: 'new';

			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/${itemId}/edit`, {
					saved: 'true',
					branch: branchName
				})
			);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			handleGitHubRouteError(requestContext, err, getRoutePath(url));
			logError(err, 'Prepare preview');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
