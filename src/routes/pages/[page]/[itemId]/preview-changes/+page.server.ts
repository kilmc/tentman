// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createContentDocument, saveContentDocument } from '$lib/content/service.js';
import { formatErrorMessage, logError } from '$lib/utils/errors.js';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { getRoutePath } from '$lib/utils/routing';
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
			const formBranchName = formData.get('branchName') as string | null;
			const { branchName, created } = await ensureDraftBranch(octokit, owner, name, formBranchName);
			if (created) {
				console.log(`✅ Created draft branch: ${branchName}`);
			}

			// Save or create the content to the draft branch
			if (isNew) {
				await createContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					contentData,
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
					contentData,
					saveOptions
				);
			}

			console.log(`✅ Saved content to ${branchName}`);

			// Redirect back to index page
			throw redirect(
				303,
				`/pages/${params.page}?saved=true&branch=${encodeURIComponent(branchName)}`
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
			const { backend, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string) as ContentRecord;
			const isNew = formData.get('isNew') === 'true';
			const filename = (formData.get('filename') as string) || undefined;
			const newFilename = (formData.get('newFilename') as string) || undefined;

			// Save or create the content directly to main branch
			if (isNew) {
				await createContentDocument(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					contentData,
					{
						filename: newFilename
						// No branch = commits to default branch
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
					contentData,
					saveOptions
				);
			}

			// Redirect to list view with success message
			throw redirect(303, `/pages/${params.page}?published=true`);
		} catch (err) {
			// Handle redirects
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
				throw err;
			}

			handleGitHubRouteError(requestContext, err, getRoutePath(url));
			// Check for protected branch error
			if (
				err &&
				typeof err === 'object' &&
				'status' in err &&
				err.status === 403 &&
				'message' in err &&
				typeof err.message === 'string' &&
				err.message.toLowerCase().includes('protected')
			) {
				return fail(403, {
					error:
						'Cannot publish directly to main branch. The main branch is protected. Please use "Save to Draft" instead to create a draft, then merge via pull request.'
				});
			}

			logError(err, 'Publish now');
			return fail(500, {
				error: formatErrorMessage(err)
			});
		}
	}
};
