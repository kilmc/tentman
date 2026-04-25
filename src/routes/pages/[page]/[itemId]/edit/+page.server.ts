// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { deleteContentDocument } from '$lib/content/service';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { findContentItemByRoute } from '$lib/features/content-management/item';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

export const actions: Actions = {
	delete: async ({ locals, params, cookies, request, url }) => {
		const requestContext = { locals, cookies };

		try {
			const { backend, discoveredConfig } = await requireDiscoveredConfig(
				requestContext,
				params.page
			);
			const formData = await request.formData();
			const branch = (formData.get('branch') as string | null) || undefined;

			const itemId = params.itemId;

			// Delete the content - prepare options based on type
			const deleteOptions: { itemId?: string; filename?: string; branch?: string } = { branch };

			if (discoveredConfig.config.content.mode === 'directory') {
				// Directory-backed collections need the stored filename to delete an entry
				const { getCachedContent } = await import('$lib/stores/content-cache');
				const content = await getCachedContent(
					backend,
					discoveredConfig.config,
					discoveredConfig.path,
					params.page,
					branch
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
					deleted: 'true',
					branch
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
			const { discoveredConfig } = await requireDiscoveredConfig(requestContext, params.page);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);
			const branch = (formData.get('branch') as string | null) || undefined;

			// Encode the data to pass via URL
			const encodedData = Buffer.from(JSON.stringify(contentData)).toString('base64url');

			// Directory-backed collections need filename information
			const filename =
				discoveredConfig.config.content.mode === 'directory'
					? (formData.get('filename') as string)
					: undefined;

			if (discoveredConfig.config.content.mode === 'directory') {
				if (!filename) {
					return fail(400, {
						error: 'Filename is required for collection items. Please try reloading the page.'
					});
				}
			}

			// Redirect to preview-changes page
			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/${params.itemId}/preview-changes`, {
					data: encodedData,
					filename,
					branch
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
