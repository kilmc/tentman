// SERVER_JUSTIFICATION: privileged_mutation
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	invalidateNavigationManifestStateCache,
	loadNavigationManifestState,
	manageCollectionGroups,
	parseNavigationManifest,
	reconcileManualNavigationSetup,
	saveCollectionOrder,
	writeRootManualSorting,
	writeMissingContentConfigIds,
	writeNavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import type {
	CollectionGroupManagementMutation,
	CollectionOrderDraft
} from '$lib/features/content-management/navigation-manifest';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { withTrackedBatchedRepositoryWrites } from '$lib/repository/batch';
import {
	createGitHubRepositoryBackend,
	invalidateGitHubRepositoryMetadataCache
} from '$lib/repository/github';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import { getRepositorySnapshot, invalidateRepositoryData } from '$lib/server/repository-data';
import { invalidateCache } from '$lib/stores/config-cache';

const CONFIG_ID_COMMIT_MESSAGE = 'Add Tentman content config ids';
const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

type NavigationManifestMutation =
	| {
			action: 'enable';
	  }
	| {
			action: 'repair';
	  }
	| {
			action: 'add-missing-config-ids';
	  }
	| {
			action: 'save-manifest';
			manifest: unknown;
	  }
	| {
			action: 'manage-collection-groups';
			collection: string;
			mutation: CollectionGroupManagementMutation;
	  }
	| {
			action: 'save-collection-order';
			collection: string;
			order: unknown;
	  };

function assertMutation(value: unknown): NavigationManifestMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw error(400, 'Invalid navigation manifest request');
	}

	const mutation = value as {
		action?: unknown;
		manifest?: unknown;
		collection?: unknown;
		mutation?: unknown;
		order?: unknown;
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

	if (mutation.action === 'manage-collection-groups') {
		if (typeof mutation.collection !== 'string' || mutation.collection.length === 0) {
			throw error(400, 'Collection group management requires a collection');
		}

		assertCollectionGroupManagementMutation(mutation.mutation);

		return mutation as NavigationManifestMutation;
	}

	if (mutation.action === 'save-collection-order') {
		if (typeof mutation.collection !== 'string' || mutation.collection.length === 0) {
			throw error(400, 'Collection order save requires a collection');
		}

		if (!mutation.order || typeof mutation.order !== 'object' || Array.isArray(mutation.order)) {
			throw error(400, 'Collection order save requires an order payload');
		}

		return mutation as NavigationManifestMutation;
	}

	throw error(400, 'Unknown navigation manifest action');
}

function assertNonEmptyString(value: unknown, message: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw error(400, message);
	}
}

function assertCollectionGroupManagementMutation(
	value: unknown
): asserts value is CollectionGroupManagementMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw error(400, 'Collection group management requires a mutation payload');
	}

	const mutation = value as Record<string, unknown>;

	if (mutation.action === 'create') {
		assertNonEmptyString(mutation.label, 'Create group requires a label');
		assertNonEmptyString(mutation.value, 'Create group requires a value');
		if (mutation.id !== undefined) {
			assertNonEmptyString(mutation.id, 'Create group id must be a non-empty string');
		}
		return;
	}

	if (mutation.action === 'edit') {
		assertNonEmptyString(mutation.groupId, 'Edit group requires a group id');
		assertNonEmptyString(mutation.label, 'Edit group requires a label');
		assertNonEmptyString(mutation.value, 'Edit group requires a value');
		return;
	}

	if (mutation.action === 'delete') {
		assertNonEmptyString(mutation.groupId, 'Delete group requires a group id');
		return;
	}

	if (mutation.action === 'merge') {
		assertNonEmptyString(mutation.sourceGroupId, 'Merge group requires a source group id');
		assertNonEmptyString(mutation.targetGroupId, 'Merge group requires a target group id');
		return;
	}

	throw error(400, 'Unknown collection group management action');
}

function readStringArray(value: unknown, field: string): string[] {
	if (
		!Array.isArray(value) ||
		value.some((entry) => typeof entry !== 'string' || entry.length === 0)
	) {
		throw error(400, `${field} must be an array of item ids`);
	}

	return value;
}

function assertCollectionOrder(value: unknown): CollectionOrderDraft {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw error(400, 'Collection order must be an object');
	}

	const order = value as { groups?: unknown; ungroupedItems?: unknown };
	if (!Array.isArray(order.groups)) {
		throw error(400, 'Collection order groups must be an array');
	}

	return {
		ungroupedItems: readStringArray(order.ungroupedItems ?? [], 'Collection order ungroupedItems'),
		groups: order.groups.map((group, index) => {
			if (!group || typeof group !== 'object' || Array.isArray(group)) {
				throw error(400, `Collection order groups[${index}] must be an object`);
			}

			const candidate = group as { id?: unknown; label?: unknown; items?: unknown };
			if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
				throw error(400, `Collection order groups[${index}].id must be a non-empty string`);
			}

			if (
				candidate.label !== undefined &&
				(typeof candidate.label !== 'string' || candidate.label.length === 0)
			) {
				throw error(400, `Collection order groups[${index}].label must be a non-empty string`);
			}

			return {
				id: candidate.id,
				...(candidate.label ? { label: candidate.label } : {}),
				items: readStringArray(candidate.items ?? [], `Collection order groups[${index}].items`)
			};
		})
	};
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
		const requiresDraftBranch = mutation.action !== undefined;
		const draftBranch = requiresDraftBranch
			? await ensureDraftBranch(octokit, owner, name, locals.selectedRepo.default_branch)
			: null;
		const writeOptions = draftBranch
			? {
					ref: draftBranch.branchName
				}
			: {};
		const draftBackend = draftBranch
			? createGitHubRepositoryBackend(octokit, locals.selectedRepo, {
					defaultRef: draftBranch.branchName
				})
			: null;
		const snapshot = await getRepositorySnapshot({
			backend,
			ref: draftBranch?.branchName
		});
		const configs = snapshot.configIndex.configs;
		const rootConfig = snapshot.rootConfig;
		const manifestState = snapshot.navigationManifest;
		const nextConfigs = configs.map((config) => ({
			...config,
			config: {
				...config.config
			}
		}));

		const { changedPaths } = await withTrackedBatchedRepositoryWrites(
			backend,
			{
				message:
					mutation.action === 'add-missing-config-ids'
						? CONFIG_ID_COMMIT_MESSAGE
						: MANIFEST_COMMIT_MESSAGE,
				...writeOptions
			},
			async (batchBackend) => {
				if (
					mutation.action === 'add-missing-config-ids' ||
					mutation.action === 'enable' ||
					mutation.action === 'repair'
				) {
					const writtenConfigIds = await writeMissingContentConfigIds(batchBackend, configs, {
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
						await writeRootManualSorting(batchBackend, {
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
						batchBackend,
						nextConfigs,
						nextRootConfig,
						manifestState.manifest,
						{
							message: CONFIG_ID_COMMIT_MESSAGE,
							...writeOptions
						}
					);
					await writeNavigationManifest(batchBackend, manifest, {
						message: MANIFEST_COMMIT_MESSAGE,
						...writeOptions
					});
				}

				if (mutation.action === 'save-manifest') {
					const manifest = parseNavigationManifest(JSON.stringify(mutation.manifest));
					await writeNavigationManifest(batchBackend, manifest, {
						message: MANIFEST_COMMIT_MESSAGE,
						...writeOptions
					});
				}

				if (mutation.action === 'manage-collection-groups') {
					const collectionConfig = nextConfigs.find(
						(config) => config.slug === mutation.collection
					);
					if (!collectionConfig) {
						throw error(404, 'Collection config not found');
					}

					await manageCollectionGroups(
						batchBackend,
						collectionConfig,
						mutation.mutation,
						manifestState.manifest,
						{
							message: MANIFEST_COMMIT_MESSAGE,
							...writeOptions
						}
					);
				}

				if (mutation.action === 'save-collection-order') {
					const collectionConfig = nextConfigs.find(
						(config) => config.slug === mutation.collection
					);
					if (!collectionConfig) {
						throw error(404, 'Collection config not found');
					}

					await saveCollectionOrder(
						batchBackend,
						collectionConfig,
						assertCollectionOrder(mutation.order),
						manifestState.manifest,
						{
							message: MANIFEST_COMMIT_MESSAGE,
							...writeOptions
						}
					);
				}
			}
		);

		if (draftBranch) {
			await ensureDraftPullRequest(
				octokit,
				owner,
				name,
				draftBranch.branchName,
				locals.selectedRepo.default_branch
			);
		}

		invalidateCache(backend.cacheKey);
		invalidateGitHubRepositoryMetadataCache(backend.cacheKey);
		invalidateNavigationManifestStateCache(backend);
		invalidateNavigationManifestStateCache(backend, writeOptions);
		invalidateRepositoryData({
			backend,
			ref: writeOptions.ref,
			changedPaths: changedPaths.length > 0 ? changedPaths : ['tentman/navigation-manifest.json'],
			reason: 'navigation-manifest'
		});

		if (draftBackend) {
			invalidateCache(draftBackend.cacheKey);
			invalidateGitHubRepositoryMetadataCache(draftBackend.cacheKey);
			invalidateNavigationManifestStateCache(draftBackend);
			invalidateRepositoryData({
				backend: draftBackend,
				ref: draftBranch?.branchName,
				changedPaths: changedPaths.length > 0 ? changedPaths : ['tentman/navigation-manifest.json'],
				reason: 'navigation-manifest'
			});
		}

		return json({
			navigationManifest: await loadNavigationManifestState(backend, writeOptions),
			branchName: draftBranch?.branchName ?? null,
			changedPaths: changedPaths.length > 0 ? changedPaths : ['tentman/navigation-manifest.json']
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
