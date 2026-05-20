// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { deleteContentDocument, saveContentDocument } from '$lib/content/service';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { findContentItemByRoute } from '$lib/features/content-management/item';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { syncCollectionItemGroupSelection } from '$lib/features/content-management/navigation-manifest';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import { getExistingItemMutationOptions } from '$lib/server/preview';
import type { ContentRecord } from '$lib/features/content-management/types';

export const actions: Actions = {
	delete: async ({ locals, params, cookies, request, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);
			const formData = await request.formData();
			const itemId = params.itemId;
			const { branchName } = await ensureDraftBranch(octokit, owner, name);

			// Delete the content - prepare options based on type
			const deleteOptions: { itemId?: string; filename?: string; branch?: string } = {
				branch: branchName
			};

			if (discoveredConfig.config.content.mode === 'directory') {
				// Directory-backed collections need the stored filename to delete an entry
				const { getCachedContent } = await import('$lib/stores/content-cache');
				const content = await getCachedContent(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					params.page,
					branchName
				);

				if (Array.isArray(content)) {
					const item = findContentItemByRoute(content, discoveredConfig.config, itemId);

					if (item?._filename) {
						deleteOptions.filename = item._filename;
					}
				}
			} else {
				// File-backed collections delete by item ID
				deleteOptions.itemId = itemId;
			}

			await deleteContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				deleteOptions
			);

			// Redirect back to list view with success message
			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}`, {
					deleted: 'true'
				})
			);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			handleGitHubRouteError(requestContext, err, getRoutePath(url));
			logError(err, 'Delete content');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	saveToPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const filename =
				discoveredConfig.config.content.mode === 'directory'
					? ((formData.get('filename') as string | null) ?? undefined)
					: undefined;
			const { branchName } = await ensureDraftBranch(octokit, owner, name);
			const materialized = await materializeDraftAssetsFromFormData({
				formData,
				content: contentData,
				backend,
				writeOptions: {
					ref: branchName
				}
			});
			const saveOptions = getExistingItemMutationOptions(
				discoveredConfig.config.content.mode,
				params.itemId,
				filename
			);

			if (!saveOptions) {
				return fail(400, {
					error: 'Filename is required for collection items. Please try reloading the page.'
				});
			}

			await saveContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				materialized.content,
				{
					branch: branchName,
					...saveOptions
				}
			);
			await syncCollectionItemGroupSelection(backend, discoveredConfig, materialized.content, undefined, {
				ref: branchName
			});
			await ensureDraftPullRequest(octokit, owner, name, branchName);

			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/${params.itemId}/edit`, {
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
