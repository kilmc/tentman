// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { saveContentDocument } from '$lib/content/service.js';
import { formatErrorMessage, logError } from '$lib/utils/errors.js';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
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

			// Save the content to the draft branch
			await saveContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				contentData,
				{
					branch: branchName
				}
			);

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

			// Save the content directly to main branch (no branch specified = default branch)
			await saveContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				contentData
				// No branch option = commits to default branch
			);

			// Redirect to index with success message
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
