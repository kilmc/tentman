// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createContentDocument } from '$lib/content/service';
import { InvalidDirectoryFilenameError } from '$lib/features/content-management/transforms';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { withTrackedBatchedRepositoryWrites } from '$lib/repository/batch';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import { invalidateRepositoryData } from '$lib/server/repository-data';
import type { ContentRecord } from '$lib/features/content-management/types';

export const actions: Actions = {
	createToPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, defaultBranch, discoveredConfig } =
				await requireDiscoveredConfig(requestContext, params.page);
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const newFilename = (formData.get('newFilename') as string | null) || undefined;
			const { branchName } = await ensureDraftBranch(octokit, owner, name, defaultBranch);
			const writeOptions = {
				message: `Create ${discoveredConfig.config.label} via Tentman CMS`,
				ref: branchName
			};

			const { changedPaths } = await withTrackedBatchedRepositoryWrites(
				backend,
				writeOptions,
				async (batchBackend) => {
					const materialized = await materializeDraftAssetsFromFormData({
						formData,
						content: contentData,
						configPath: discoveredConfig.path,
						blocks: discoveredConfig.config.blocks,
						backend: batchBackend,
						assets: (await batchBackend.readRootConfig())?.assets,
						writeOptions: {
							ref: branchName
						}
					});

					await createContentDocument(
						batchBackend,
						discoveredConfig.config,
						discoveredConfig.path,
						materialized.content,
						{
							filename: newFilename,
							branch: branchName
						}
					);
				}
			);
			await ensureDraftPullRequest(octokit, owner, name, branchName, defaultBranch);
			invalidateRepositoryData({
				backend,
				ref: branchName,
				changedPaths,
				reason: 'content-write'
			});

			const itemId =
				discoveredConfig.config.idField && contentData[discoveredConfig.config.idField]
					? contentData[discoveredConfig.config.idField]
					: 'new';

			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/${itemId}/edit`, {
					saved: 'true'
				})
			);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			if (err instanceof InvalidDirectoryFilenameError) {
				return fail(400, {
					error: err.message
				});
			}

			handleGitHubRouteError(requestContext, err, getRoutePath(url));
			logError(err, 'Prepare preview');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
