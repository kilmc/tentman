// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createContentDocument, saveContentDocument } from '$lib/content/service.js';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { formatErrorMessage, logError } from '$lib/utils/errors.js';
import { ensureDraftBranch, publishDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { syncCollectionItemGroupSelection } from '$lib/features/content-management/navigation-manifest';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import { getExistingItemMutationOptions } from '$lib/server/preview';
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
			const isNew = formData.get('isNew') === 'true';
			const filename = (formData.get('filename') as string) || undefined;
			const newFilename = (formData.get('newFilename') as string) || undefined;

			// Get or create draft branch
			const { branchName, created } = await ensureDraftBranch(octokit, owner, name);
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

			// Save or create the content to the draft branch
			if (isNew) {
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
			} else {
				const existingItemOptions = getExistingItemMutationOptions(
					discoveredConfig.config.content.mode,
					params.itemId,
					filename,
					newFilename
				);

				if (!existingItemOptions) {
					return fail(400, {
						error: 'Filename is required for directory-backed content.'
					});
				}

				const saveOptions = {
					branch: branchName,
					...existingItemOptions
				};

				await saveContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					materialized.content,
					saveOptions
				);
				await syncCollectionItemGroupSelection(backend, discoveredConfig, materialized.content, undefined, {
					ref: branchName
				});
			}
			await ensureDraftPullRequest(octokit, owner, name, branchName);

			console.log(`✅ Saved content to ${branchName}`);

			// Redirect back to index page
			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/${params.itemId}/edit`, { saved: 'true' })
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
			const isNew = formData.get('isNew') === 'true';
			const filename = (formData.get('filename') as string) || undefined;
			const newFilename = (formData.get('newFilename') as string) || undefined;
			const { branchName } = await ensureDraftBranch(octokit, owner, name);
			const materialized = await materializeDraftAssetsFromFormData({
				formData,
				content: contentData,
				backend,
				writeOptions: {
					ref: branchName
				}
			});

			if (isNew) {
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
			} else {
				const saveOptions = getExistingItemMutationOptions(
					discoveredConfig.config.content.mode,
					params.itemId,
					filename,
					newFilename
				);

				if (!saveOptions) {
					return fail(400, {
						error: 'Filename is required for directory-backed content.'
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
			}
			await publishDraftBranch(octokit, owner, name);

			const { invalidateContent } = await import('$lib/stores/content-cache');
			const { invalidateCache } = await import('$lib/stores/config-cache');
			const { invalidateGitHubRepositoryMetadataCache } = await import('$lib/repository/github');
			const {
				invalidateNavigationManifestStateCache
			} = await import('$lib/features/content-management/navigation-manifest');
			invalidateCache(backend.cacheKey);
			invalidateContent(backend.cacheKey);
			invalidateGitHubRepositoryMetadataCache(backend.cacheKey);
			invalidateNavigationManifestStateCache(backend);

			const redirectPath = isNew
				? `/pages/${params.page}`
				: `/pages/${params.page}/${params.itemId}/edit`;
			throw redirect(303, buildPathWithQuery(redirectPath, { published: 'true' }));
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
