// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { deleteContentDocument, saveContentDocument } from '$lib/content/service';
import { InvalidDirectoryFilenameError } from '$lib/features/content-management/transforms';
import { materializeDraftAssetsFromFormData } from '$lib/features/draft-assets/server';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { syncCollectionItemGroupSelection } from '$lib/features/content-management/navigation-manifest';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { withTrackedBatchedRepositoryWrites } from '$lib/repository/batch';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';
import {
	resolveExistingItemMutationOptions,
	resolveExistingCollectionItemDeleteOptions
} from '$lib/server/preview';
import { invalidateRepositoryData } from '$lib/server/repository-data';
import type { ContentRecord } from '$lib/features/content-management/types';
import { createWorkflowMutationResult } from '$lib/repository/workflow-mutations';

export const actions: Actions = {
	delete: async ({ locals, params, cookies, request, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, defaultBranch, discoveredConfig } =
				await requireDiscoveredConfig(requestContext, params.page);
			const itemId = params.itemId;
			const { branchName } = await ensureDraftBranch(octokit, owner, name, defaultBranch);
			const writeOptions = {
				message: `Delete ${discoveredConfig.config.label} via Tentman CMS`,
				ref: branchName
			};

			const deleteOptions = await resolveExistingCollectionItemDeleteOptions({
				backend,
				discoveredConfig,
				itemId,
				branch: branchName
			});

			const { changedPaths } = await withTrackedBatchedRepositoryWrites(
				backend,
				writeOptions,
				(batchBackend) =>
					deleteContentDocument(
						batchBackend,
						discoveredConfig.config,
						discoveredConfig.path,
						deleteOptions
					)
			);
			await ensureDraftPullRequest(octokit, owner, name, branchName, defaultBranch);
			invalidateRepositoryData({
				backend,
				ref: branchName,
				changedPaths,
				reason: 'content-write'
			});

			const mutation = createWorkflowMutationResult({
				mode: 'github',
				intent: {
					type: 'delete-item',
					slug: discoveredConfig.slug,
					itemId
				},
				message: 'Item deleted from draft.',
				changedPaths,
				redirect: {
					href: buildPathWithQuery(`/pages/${params.page}`, {
						deleted: 'true'
					})
				},
				refresh: {
					workspace: true,
					collections: [discoveredConfig.slug],
					cachePaths: changedPaths
				}
			});

			throw redirect(
				mutation.redirect?.status ?? 303,
				mutation.redirect?.href ??
					buildPathWithQuery(`/pages/${params.page}`, {
						deleted: 'true'
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
			logError(err, 'Delete content');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	},

	saveToPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, octokit, owner, name, defaultBranch, discoveredConfig } =
				await requireDiscoveredConfig(requestContext, params.page);
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const filename =
				discoveredConfig.config.content.mode === 'directory'
					? ((formData.get('filename') as string | null) ?? undefined)
					: undefined;
			const { branchName } = await ensureDraftBranch(octokit, owner, name, defaultBranch);
			const writeOptions = {
				message: `Update ${discoveredConfig.config.label} via Tentman CMS`,
				ref: branchName
			};
			const saveOptions = await resolveExistingItemMutationOptions({
				backend,
				discoveredConfig,
				itemId: params.itemId,
				filename
			});

			if (!saveOptions) {
				return fail(400, {
					error: 'Filename is required for collection items. Please try reloading the page.'
				});
			}

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

					await saveContentDocument(
						batchBackend,
						discoveredConfig.config,
						discoveredConfig.path,
						materialized.content,
						{
							branch: branchName,
							...saveOptions
						}
					);
					await syncCollectionItemGroupSelection(
						batchBackend,
						discoveredConfig,
						materialized.content,
						undefined,
						{
							ref: branchName
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

			const mutation = createWorkflowMutationResult({
				mode: 'github',
				intent: {
					type: 'save-content',
					slug: discoveredConfig.slug,
					target: 'collection-item',
					itemId: params.itemId
				},
				message: 'Changes saved to draft.',
				changedPaths,
				redirect: {
					href: buildPathWithQuery(`/pages/${params.page}/${params.itemId}/edit`, {
						saved: 'true'
					})
				},
				recoveryCleanup: {
					clearEditorRecovery: true
				},
				refresh: {
					workspace: true,
					collections: [discoveredConfig.slug],
					cachePaths: changedPaths
				}
			});

			throw redirect(
				mutation.redirect?.status ?? 303,
				mutation.redirect?.href ??
					buildPathWithQuery(`/pages/${params.page}/${params.itemId}/edit`, {
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
