import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { formatErrorMessage, logError } from '$lib/utils/errors';

export const load: PageServerLoad = async ({ locals, params, cookies, depends }) => {
	const startTime = performance.now();
	console.log(`🟢 [VIEW ${params.page}] Starting load...`);

	// Auth check
	if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
		throw redirect(302, '/auth/login?redirect=/pages');
	}

	// Get configs from locals (already loaded by layout)
	// Note: We'll get this from parent data via SvelteKit's automatic data flow
	depends('app:content');

	const { owner, name } = locals.selectedRepo;

	// We need to get configs - since parent() causes double load,
	// let's use the cache directly
	const { getCachedConfigs } = await import('$lib/stores/config-cache');
	const configs = await getCachedConfigs(locals.octokit, owner, name);

	// Find config matching the slug
	const discoveredConfig = configs.find((c) => c.slug === params.page);

	if (!discoveredConfig) {
		throw error(404, 'Configuration not found');
	}

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
				locals.octokit,
				owner,
				name,
				discoveredConfig.config,
				discoveredConfig.type,
				discoveredConfig.path,
				params.page // slug for cache key
			);
			const fetchEndTime = performance.now();
			console.log(`🟢 [VIEW ${params.page}] Content retrieved in ${(fetchEndTime - fetchStartTime).toFixed(2)}ms`);
		} catch (err) {
			logError(err, 'Fetch content');
			contentError = formatErrorMessage(err);
		}

		// Check for draft branch (auto-discover from GitHub)
		let draftBranch = null;
		let draftChanges = null;

		try {
			const { listPreviewBranches } = await import('$lib/github/branch');
			const branches = await listPreviewBranches(locals.octokit, owner, name);

			if (branches.length > 0) {
				// Use the most recent preview branch
				draftBranch = branches[0].name;
				console.log(`🟢 [VIEW ${params.page}] Found draft branch: ${draftBranch}`);

				// Compare draft content to main for this config
				const draftStartTime = performance.now();
				const { compareDraftToBranch } = await import('$lib/utils/draft-comparison');
				draftChanges = await compareDraftToBranch(
					locals.octokit,
					owner,
					name,
					discoveredConfig.config,
					discoveredConfig.type,
					discoveredConfig.path,
					draftBranch
				);
				const draftEndTime = performance.now();
				console.log(`🟢 [VIEW ${params.page}] Draft comparison completed in ${(draftEndTime - draftStartTime).toFixed(2)}ms`);
			}
		} catch (err) {
			console.error(`[VIEW ${params.page}] Failed to check for draft:`, err);
			// Don't fail the whole page load
			draftBranch = null;
			draftChanges = null;
		}

		const totalTime = performance.now() - startTime;
		console.log(`✅ [VIEW ${params.page}] Total load time: ${totalTime.toFixed(2)}ms`);

		return {
			discoveredConfig,
			content,
			contentError,
			draftBranch,
			draftChanges
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			throw err;
		}
		console.error('Failed to load config:', err);
		throw error(500, 'Failed to load configuration');
	}
};

