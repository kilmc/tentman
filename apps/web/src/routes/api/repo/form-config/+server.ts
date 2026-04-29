// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireDiscoveredConfig } from '$lib/server/page-context';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('slug');
	const branch = url.searchParams.get('branch') || undefined;
	if (!slug) {
		throw error(400, 'Missing page slug');
	}

	const requestContext = { locals, cookies };

	try {
		const { backend, discoveredConfig } = await requireDiscoveredConfig(
			requestContext,
			slug,
			`/pages/${slug}/new`
		);
		const { blockConfigs, packageBlocks, blockRegistryError } =
			await loadGitHubBlockRegistryData(backend);
		const navigationManifest = await loadNavigationManifestState(backend, { ref: branch });

		return json({
			discoveredConfig,
			blockConfigs,
			packageBlocks,
			blockRegistryError,
			navigationManifest,
			pageSlug: slug,
			branch: branch ?? null,
			mode: 'github' as const
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}

		console.error(`Failed to load form config for ${slug}:`, err);
		throw error(500, 'Failed to load form config');
	}
};
