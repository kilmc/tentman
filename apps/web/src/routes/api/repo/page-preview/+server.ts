// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { previewContentChanges } from '$lib/content/service';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireDiscoveredConfig } from '$lib/server/page-context';
import { parseEncodedPreviewContentData } from '$lib/server/preview';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	const encodedData = url.searchParams.get('data');

	if (!slug || !encodedData) {
		throw error(400, 'Missing preview parameters');
	}

	const requestContext = { locals, cookies };

	try {
		const { backend, owner, name, discoveredConfig } = await requireDiscoveredConfig(
			requestContext,
			slug,
			`/pages/${slug}/preview-changes`
		);

		if (discoveredConfig.config.collection) {
			return json({
				redirectTo: `/pages/${slug}`
			});
		}

		let contentData;
		try {
			contentData = parseEncodedPreviewContentData(encodedData);
		} catch (err) {
			logError(err, 'Parse preview data');
			throw error(400, 'Invalid preview data');
		}

		let changesSummary = null;
		let changesError = null;

		try {
			changesSummary = await previewContentChanges(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				contentData
			);
		} catch (err) {
			handleGitHubSessionError({ cookies }, err);
			logError(err, 'Calculate changes');
			changesError = formatErrorMessage(err);
		}

		return json({
			discoveredConfig,
			contentData,
			changesSummary,
			changesError,
			repo: { owner, name }
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (
			err &&
			typeof err === 'object' &&
			'status' in err &&
			(err.status === 400 || err.status === 404)
		) {
			throw err;
		}

		console.error(`Failed to load page preview for ${slug}:`, err);
		throw error(500, 'Failed to load page preview');
	}
};
