// SERVER_JUSTIFICATION: privileged_mutation
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	buildNavigationManifestFromRepository,
	loadNavigationManifestState,
	parseNavigationManifest,
	writeMissingContentConfigIds,
	writeNavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import { invalidateCache } from '$lib/stores/config-cache';
import { getCachedConfigs } from '$lib/stores/config-cache';

const CONFIG_ID_COMMIT_MESSAGE = 'Add Tentman content config ids';
const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

type NavigationManifestMutation =
	| {
			action: 'enable';
	  }
	| {
			action: 'add-missing-config-ids';
	  }
	| {
			action: 'save-manifest';
			manifest: unknown;
	  };

function assertMutation(value: unknown): NavigationManifestMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw error(400, 'Invalid navigation manifest request');
	}

	const mutation = value as { action?: unknown; manifest?: unknown };

	if (mutation.action === 'enable' || mutation.action === 'add-missing-config-ids') {
		return mutation as NavigationManifestMutation;
	}

	if (mutation.action === 'save-manifest') {
		return mutation as NavigationManifestMutation;
	}

	throw error(400, 'Unknown navigation manifest action');
}

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	const backend = createGitHubRepositoryBackend(octokit, locals.selectedRepo);

	try {
		const mutation = assertMutation(await request.json());
		const configs = await getCachedConfigs(backend);

		if (mutation.action === 'add-missing-config-ids' || mutation.action === 'enable') {
			await writeMissingContentConfigIds(backend, configs, {
				message: CONFIG_ID_COMMIT_MESSAGE
			});
			invalidateCache(backend.cacheKey);
		}

		const nextConfigs = await getCachedConfigs(backend);

		if (mutation.action === 'enable') {
			const manifest = await buildNavigationManifestFromRepository(backend, nextConfigs);
			await writeNavigationManifest(backend, manifest, {
				message: MANIFEST_COMMIT_MESSAGE
			});
		}

		if (mutation.action === 'save-manifest') {
			const manifest = parseNavigationManifest(JSON.stringify(mutation.manifest));
			await writeNavigationManifest(backend, manifest, {
				message: MANIFEST_COMMIT_MESSAGE
			});
		}

		return json({
			navigationManifest: await loadNavigationManifestState(backend)
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error('Failed to update navigation manifest:', err);
		throw error(500, 'Failed to update navigation manifest');
	}
};
