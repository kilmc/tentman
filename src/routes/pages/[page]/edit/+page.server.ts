// SERVER_JUSTIFICATION: privileged_mutation
import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { buildPathWithQuery, getRoutePath } from '$lib/utils/routing';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

export const actions: Actions = {
	saveToPreview: async ({ locals, params, request, cookies, url }) => {
		const requestContext = { locals, cookies };

		try {
			await requireDiscoveredConfig(requestContext, params.page);

			// Parse form data
			const formData = await request.formData();
			const contentData = JSON.parse(formData.get('data') as string);
			const branch = (formData.get('branch') as string | null) || undefined;

			// Encode the data to pass via URL
			const encodedData = Buffer.from(JSON.stringify(contentData)).toString('base64url');

			// Redirect to preview-changes page
			throw redirect(
				303,
				buildPathWithQuery(`/pages/${params.page}/preview-changes`, {
					data: encodedData,
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
