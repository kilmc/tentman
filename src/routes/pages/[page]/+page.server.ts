import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';
import { getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import { isLocalMode, requireDiscoveredConfig } from '$lib/server/page-context';

export const load: PageServerLoad = async ({ locals, params, cookies, depends }) => {
	const startTime = performance.now();
	console.log(`🟢 [VIEW ${params.page}] Starting load...`);

	if (isLocalMode(locals)) {
		return {
			discoveredConfig: null,
			blockConfigs: [],
			packageBlocks: [],
			content: null,
			contentError: null,
			blockRegistryError: null,
			draftBranch: null,
			draftChanges: null,
			pageSlug: params.page,
			mode: 'local' as const
		};
	}

	// Get configs from locals (already loaded by layout)
	// Note: We'll get this from parent data via SvelteKit's automatic data flow
	depends('app:content');
	const { backend, octokit, owner, name, discoveredConfig } = await requireDiscoveredConfig(
		locals,
		params.page
	);

	try {
		// Fetch the actual content based on config type
		// Uses cache populated by layout prefetch
		let content = null;
		let contentError = null;

		try {
			const fetchStartTime = performance.now();
			console.log(`🟢 [VIEW ${params.page}] Getting content...`);
			const { getCachedContent } = await import('$lib/stores/content-cache');
			content = await getCachedContent(
				backend,
				discoveredConfig.config,
				discoveredConfig.path,
				params.page // slug for cache key
			);
			const fetchEndTime = performance.now();
			console.log(
				`🟢 [VIEW ${params.page}] Content retrieved in ${(fetchEndTime - fetchStartTime).toFixed(2)}ms`
			);
		} catch (err) {
			logError(err, 'Fetch content');
			contentError = formatErrorMessage(err);
		}

		// Check for draft branch (auto-discover from GitHub)
		let draftBranch = null;
		let draftChanges = null;

		try {
			draftBranch = await getLatestPreviewBranchName(octokit, owner, name);
			if (draftBranch) {
				console.log(`🟢 [VIEW ${params.page}] Found draft branch: ${draftBranch}`);

				// Compare draft content to main for this config
				const draftStartTime = performance.now();
				const { compareDraftToBranch } = await import('$lib/utils/draft-comparison');
				draftChanges = await compareDraftToBranch(
					octokit,
					owner,
					name,
					discoveredConfig.config,
					discoveredConfig.path,
					draftBranch
				);
				const draftEndTime = performance.now();
				console.log(
					`🟢 [VIEW ${params.page}] Draft comparison completed in ${(draftEndTime - draftStartTime).toFixed(2)}ms`
				);
			}
		} catch (err) {
			console.error(`[VIEW ${params.page}] Failed to check for draft:`, err);
			// Don't fail the whole page load
			draftBranch = null;
			draftChanges = null;
		}

		const totalTime = performance.now() - startTime;
		console.log(`✅ [VIEW ${params.page}] Total load time: ${totalTime.toFixed(2)}ms`);

		const { blockConfigs, packageBlocks, blockRegistryError } =
			await loadGitHubBlockRegistryData(backend);

		return {
			discoveredConfig,
			blockConfigs,
			packageBlocks,
			blockRegistryError,
			content,
			contentError,
			draftBranch,
			draftChanges,
			pageSlug: params.page,
			mode: 'github' as const
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}
		console.error('Failed to load config:', err);
		throw error(500, 'Failed to load configuration');
	}
};
