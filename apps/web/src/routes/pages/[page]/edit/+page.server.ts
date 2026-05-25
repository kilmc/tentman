// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { saveContentDocument } from '$lib/content/service';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import type { ContentRecord } from '$lib/features/content-management/types';

export const actions: Actions = {
	saveToPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, defaultBranch, discoveredConfig } =
				await requireDiscoveredConfig(
				requestContext,
				params.page
				);
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const { branchName } = await ensureDraftBranch(octokit, owner, name, defaultBranch);
			const materialized = await materializeDraftAssetsFromFormData({
				formData,
				content: contentData,
				configPath: discoveredConfig.path,
				blocks: discoveredConfig.config.blocks,
				backend,
				defaultStoragePath: (await backend.readRootConfig())?.assetsDir,
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
			await ensureDraftPullRequest(octokit, owner, name, branchName, defaultBranch);

			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/edit`, {
					saved: 'true'
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
