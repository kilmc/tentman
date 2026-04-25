// SERVER_JUSTIFICATION: privileged_mutation
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	loadNavigationManifestState,
	parseNavigationManifest,
	reconcileManualNavigationSetup,
	writeRootManualSorting,
	writeMissingContentConfigIds,
	writeNavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import {
	addCollectionGroupToConfigSource,
	addNavigationGroupToManifest
} from '$lib/features/content-management/navigation-group-options';
import { ensureDraftBranch, getLatestPreviewBranchName } from '$lib/features/draft-publishing/service';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import { getCachedConfigs } from '$lib/stores/config-cache';

const CONFIG_ID_COMMIT_MESSAGE = 'Add Tentman content config ids';
const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

type NavigationManifestMutation =
	| {
			action: 'enable';
			branchName?: string;
	  }
	| {
			action: 'repair';
			branchName?: string;
	  }
	| {
			action: 'add-missing-config-ids';
			branchName?: string;
	  }
	| {
			action: 'save-manifest';
			manifest: unknown;
			branchName?: string;
	  }
	| {
			action: 'add-collection-group';
			collection: string;
			id: string;
			label: string;
			branchName?: string;
	  };

function assertMutation(value: unknown): NavigationManifestMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw error(400, 'Invalid navigation manifest request');
	}

	const mutation = value as {
		action?: unknown;
		manifest?: unknown;
		collection?: unknown;
		id?: unknown;
		label?: unknown;
		branchName?: unknown;
	};

	if (
		mutation.action === 'enable' ||
		mutation.action === 'repair' ||
		mutation.action === 'add-missing-config-ids'
	) {
		return mutation as NavigationManifestMutation;
	}

	if (mutation.action === 'save-manifest') {
		return mutation as NavigationManifestMutation;
	}

	if (mutation.action === 'add-collection-group') {
		if (
			typeof mutation.collection !== 'string' ||
			mutation.collection.length === 0 ||
			typeof mutation.id !== 'string' ||
			mutation.id.length === 0 ||
			typeof mutation.label !== 'string' ||
			mutation.label.length === 0
		) {
			throw error(400, 'New navigation group requires collection, id, and label');
		}

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

	const { owner, name } = locals.selectedRepo;
	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	const backend = createGitHubRepositoryBackend(octokit, locals.selectedRepo);

	try {
		const mutation = assertMutation(await request.json());
		const [configs, rootConfig, manifestState] = await Promise.all([
			getCachedConfigs(backend),
			backend.readRootConfig(),
			loadNavigationManifestState(backend)
		]);
		const requestedBranchName =
			typeof mutation.branchName === 'string' && mutation.branchName.length > 0
				? mutation.branchName
				: null;
		const existingDraftBranch = requestedBranchName ?? (await getLatestPreviewBranchName(octokit, owner, name));
		const requiresDraftBranch = mutation.action !== undefined;
		const draftBranch = requiresDraftBranch
			? await ensureDraftBranch(octokit, owner, name, existingDraftBranch)
			: null;
		const writeOptions = draftBranch
			? {
					ref: draftBranch.branchName
				}
			: {};
		const nextConfigs = configs.map((config) => ({
			...config,
			config: {
				...config.config
			}
		}));

		if (
			mutation.action === 'add-missing-config-ids' ||
			mutation.action === 'enable' ||
			mutation.action === 'repair'
		) {
			const writtenConfigIds = await writeMissingContentConfigIds(backend, configs, {
				message: CONFIG_ID_COMMIT_MESSAGE,
				...writeOptions
			});
			for (const writtenConfig of writtenConfigIds) {
				const matchingConfig = nextConfigs.find((config) => config.path === writtenConfig.path);
				if (matchingConfig) {
					matchingConfig.config._tentmanId = writtenConfig.suggestedId;
				}
			}
			if (mutation.action === 'enable') {
				await writeRootManualSorting(backend, {
					message: CONFIG_ID_COMMIT_MESSAGE,
					...writeOptions
				});
			}
		}

		const nextRootConfig =
			mutation.action === 'enable'
				? {
						...(rootConfig ?? {}),
						content: {
							...(rootConfig?.content ?? {}),
							sorting: 'manual' as const
						}
					}
				: rootConfig;

		if (mutation.action === 'enable' || mutation.action === 'repair') {
			const manifest = await reconcileManualNavigationSetup(
				backend,
				nextConfigs,
				nextRootConfig,
				manifestState.manifest,
				{
					message: CONFIG_ID_COMMIT_MESSAGE,
					...writeOptions
				}
			);
			await writeNavigationManifest(backend, manifest, {
				message: MANIFEST_COMMIT_MESSAGE,
				...writeOptions
			});
		}

		if (mutation.action === 'save-manifest') {
			const manifest = parseNavigationManifest(JSON.stringify(mutation.manifest));
			await writeNavigationManifest(backend, manifest, {
				message: MANIFEST_COMMIT_MESSAGE,
				...writeOptions
			});
		}

		if (mutation.action === 'add-collection-group') {
			const collectionConfig = nextConfigs.find((config) => config.slug === mutation.collection);
			if (!collectionConfig) {
				throw error(404, 'Collection config not found');
			}

			const configSource = await backend.readTextFile(collectionConfig.path);
			await backend.writeTextFile(
				collectionConfig.path,
				addCollectionGroupToConfigSource(configSource, {
					collection: mutation.collection,
					id: mutation.id,
					label: mutation.label
				}),
				{
					message: MANIFEST_COMMIT_MESSAGE,
					...writeOptions
				}
			);

			const manifestState = await loadNavigationManifestState(backend, writeOptions);
			if (manifestState.error) {
				throw error(400, `Could not parse navigation manifest: ${manifestState.error}`);
			}

			const manifest = addNavigationGroupToManifest(manifestState.manifest, {
				collection: mutation.collection,
				id: mutation.id,
				label: mutation.label
			});
			await writeNavigationManifest(backend, manifest, {
				message: MANIFEST_COMMIT_MESSAGE,
				...writeOptions
			});
		}

		return json({
			navigationManifest: await loadNavigationManifestState(backend, writeOptions),
			branchName: draftBranch?.branchName ?? null
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
