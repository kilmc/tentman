import { get } from 'svelte/store';
import type { DiscoveredConfig } from '$lib/config/discovery';
import { fetchContentDocument } from '$lib/content/service';
import {
	saveCollectionOrder,
	writeNavigationManifest,
	type NavigationManifest
} from '$lib/features/content-management/navigation-manifest';
import {
	getOrderedCollectionNavigation,
	type OrderedCollectionNavigation
} from '$lib/features/content-management/navigation';
import {
	resolveContentDocumentState,
	type ResolvedContentState
} from '$lib/features/content-management/state';
import type { RootConfig } from '$lib/config/root-config';
import { draftBranch } from '$lib/stores/draft-branch';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
import { localContent } from '$lib/stores/local-content';
import { localRepo } from '$lib/stores/local-repo';
import { traceBrowserRequest } from '$lib/utils/workflow-instrumentation';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import {
	createLocalWorkflowCollectionNavigationData,
	createLocalWorkflowConfigStatesData
} from '$lib/repository/local-workflow-data';
import { createWorkflowMutationResult } from '$lib/repository/workflow-mutations';
import type {
	PagesWorkspaceAdapter,
	PagesWorkspaceAdapterResult,
	PagesWorkspaceMode
} from './pages-workspace-consumer';
import type { NavigationDraftCollection } from './navigation-draft';

type SelectedRepo = {
	owner: string;
	name: string;
	full_name: string;
};

type ConfigStatesPayload = {
	statesBySlug?: Record<string, ResolvedContentState | null>;
	workflowData?: {
		statesBySlug?: Record<string, ResolvedContentState | null>;
	} | null;
};

export type PagesWorkspaceAdapterContext = {
	mode: PagesWorkspaceMode;
	fetcher: typeof fetch;
	selectedRepo: SelectedRepo | null;
	repositoryIdentity: { ref: string } | null;
	activeDraftBranch: string | null;
	bootstrap: RepoConfigsBootstrap;
	getConfigs(): DiscoveredConfig[];
	getNavigationManifest(): NavigationManifest | null;
	getRootConfig(): RootConfig | null;
	getCurrentConfig(): DiscoveredConfig | null;
	getRoutePath(): string;
	redirectToExpiredSession(): Promise<void>;
	switchToRepos(): Promise<void>;
	resolveEndpoint(path: string): string;
};

const MANIFEST_COMMIT_MESSAGE = 'Update Tentman navigation manifest';

const GITHUB_PAGES_INVALIDATION_PATHS = new Set([
	'/api/repo/collection-items',
	'/api/repo/collection-index',
	'/api/repo/collection-projections',
	'/api/repo/config-states',
	'/api/repo/configs',
	'/api/repo/draft-status',
	'/api/repo/form-config',
	'/api/repo/instructions',
	'/api/repo/pages-summary'
]);

export function shouldInvalidatePagesWorkspaceData(url: URL): boolean {
	return GITHUB_PAGES_INVALIDATION_PATHS.has(url.pathname);
}

function emptyCollectionNavigation(): OrderedCollectionNavigation {
	return {
		items: [],
		groups: []
	};
}

function getConfigsWithTopLevelState(configs: DiscoveredConfig[]) {
	return configs.filter((config) => !!config.config.state);
}

function getLocalWorkflowContext() {
	const repoState = get(localRepo);
	const contentState = get(localContent);
	if (!repoState.backend) {
		return null;
	}

	return {
		backend: repoState.backend,
		discoverySignature: contentState.discoverySignature ?? null
	};
}

async function loadLocalCollectionNavigation(
	config: DiscoveredConfig,
	navigationManifest: NavigationManifest | null,
	rootConfig: RootConfig | null
): Promise<OrderedCollectionNavigation> {
	const repoState = get(localRepo);
	if (!repoState.backend || !config.config.collection) {
		return emptyCollectionNavigation();
	}

	const content = await fetchContentDocument(repoState.backend, config.config, config.path);
	return getOrderedCollectionNavigation(config.config, content, navigationManifest, rootConfig);
}

async function loadLocalCollectionNavigations(
	configs: DiscoveredConfig[],
	navigationManifest: NavigationManifest | null,
	rootConfig: RootConfig | null
): Promise<Record<string, OrderedCollectionNavigation>> {
	const repoState = get(localRepo);
	if (!repoState.backend) {
		return {};
	}

	const collectionEntries = await Promise.all(
		configs
			.filter((config) => config.config.collection)
			.map(async (config) => {
				try {
					const navigation = await loadLocalCollectionNavigation(
						config,
						navigationManifest,
						rootConfig
					);
					return [config.slug, navigation] as const;
				} catch (error) {
					console.error(`Failed to load local collection items for ${config.slug}:`, error);
					return [config.slug, emptyCollectionNavigation()] as const;
				}
			})
	);

	return Object.fromEntries(collectionEntries);
}

async function loadLocalConfigStates(
	configs: DiscoveredConfig[],
	rootConfig: RootConfig | null
): Promise<Record<string, ResolvedContentState | null>> {
	const repoState = get(localRepo);
	if (!repoState.backend) {
		return {};
	}

	const stateEntries = await Promise.all(
		getConfigsWithTopLevelState(configs).map(async (config) => {
			try {
				const content = await fetchContentDocument(repoState.backend!, config.config, config.path);
				return [
					config.slug,
					resolveContentDocumentState(config.config, content, rootConfig)
				] as const;
			} catch (error) {
				console.error(`Failed to load config state for ${config.slug}:`, error);
				return [config.slug, null] as const;
			}
		})
	);

	return Object.fromEntries(stateEntries);
}

function getLocalRepoBackend() {
	const repoState = get(localRepo);
	if (!repoState.backend) {
		throw new Error('No local repository is open.');
	}

	return repoState.backend;
}

function getRefreshMessage(): string {
	const state = get(localContent);
	const configCount = state.configs.length;
	const blockCount = state.blockConfigs.length;
	return `Found ${configCount} content ${configCount === 1 ? 'config' : 'configs'} and ${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}.`;
}

async function readNavigationManifestAfterRefresh(
	fallbackManifest: NavigationManifest | null
): Promise<NavigationManifest | null> {
	await localContent.refresh({ force: true });
	return get(localContent).navigationManifest.manifest ?? fallbackManifest;
}

function setDraftBranch(branchName: string | null | undefined, selectedRepo: SelectedRepo | null) {
	if (branchName && selectedRepo) {
		draftBranch.setBranch(branchName, selectedRepo.full_name);
	}
}

async function invalidateNavigationManifestCache(context: PagesWorkspaceAdapterContext) {
	if (context.mode === 'github' && context.selectedRepo) {
		await githubRepositoryCache.invalidatePaths(['tentman/navigation-manifest.json']);
	}
}

export function createPagesWorkspaceAdapter(
	context: PagesWorkspaceAdapterContext
): PagesWorkspaceAdapter {
	let cancelled = false;
	let stopFreshnessScheduler: (() => void) | null = null;

	const adapter: PagesWorkspaceAdapter = {
		async startWorkspace() {
			cancelled = false;

			if (context.mode !== 'github' || !context.selectedRepo) {
				return { type: 'workspace-started' };
			}

			await githubRepositoryCache.hydrateFromBootstrap({
				repoFullName: context.selectedRepo.full_name,
				bootstrap: context.bootstrap
			});

			if (!cancelled) {
				stopFreshnessScheduler = githubRepositoryCache.startFreshnessScheduler({
					fetcher: context.fetcher
				});
			}

			const repoFullName = `${context.selectedRepo.owner}/${context.selectedRepo.name}`;
			if (context.activeDraftBranch) {
				draftBranch.setBranch(context.activeDraftBranch, repoFullName);
			} else if (draftBranch.hasDraft(repoFullName)) {
				draftBranch.clear();
			}

			return { type: 'workspace-started' };
		},

		stopWorkspace() {
			cancelled = true;
			stopFreshnessScheduler?.();
			stopFreshnessScheduler = null;
		},

		watchCollectionNavigation({ slug }, listener) {
			if (context.mode !== 'github') {
				return () => {};
			}

			return githubRepositoryCache.onCollectionChange(slug, (navigation) => {
				if (!navigation) {
					return;
				}

				listener({
					type: 'collection-navigation-loaded',
					slug,
					navigation
				});
			});
		},

		async switchWorkspace() {
			if (context.mode === 'local') {
				localContent.reset();
				await localRepo.clear({ invalidate: false });
			}

			await context.switchToRepos();
			return { type: 'workspace-switched' };
		},

		async refreshWorkspace() {
			if (context.mode !== 'local') {
				return {
					type: 'workspace-refreshed',
					message: '',
					remountWorkspace: false
				};
			}

			await localContent.refresh({ force: true });
			const state = get(localContent);
			if (state.status === 'error') {
				throw new Error(state.error ?? 'Failed to rescan repo.');
			}

			return {
				type: 'workspace-refreshed',
				message: getRefreshMessage(),
				remountWorkspace: true
			};
		},

		async clearWorkspaceCache() {
			if (context.mode !== 'github' || !context.selectedRepo || !context.repositoryIdentity) {
				return {
					type: 'workspace-cache-cleared',
					message: '',
					resetCollections: false,
					resetConfigStates: false
				};
			}

			await githubRepositoryCache.clearRepoRef({
				repoFullName: context.selectedRepo.full_name,
				ref: context.repositoryIdentity.ref
			});
			await githubRepositoryCache.hydrateFromBootstrap({
				repoFullName: context.selectedRepo.full_name,
				bootstrap: context.bootstrap
			});
			githubRepositoryCache.resetFreshnessSchedule();

			return {
				type: 'workspace-cache-cleared',
				message: 'GitHub cache cleared.',
				resetCollections: true,
				resetConfigStates: true
			};
		},

		async loadCollectionNavigation({ config, force, hydrateRemaining }) {
			if (!config.config.collection) {
				return {
					type: 'collection-navigation-loaded',
					slug: config.slug,
					navigation: emptyCollectionNavigation()
				};
			}

			if (context.mode === 'local') {
				const navigation = await loadLocalCollectionNavigation(
					config,
					context.getNavigationManifest(),
					context.getRootConfig()
				);
				const workflowContext = getLocalWorkflowContext();
				return {
					type: 'collection-navigation-loaded',
					slug: config.slug,
					navigation,
					workflowData: workflowContext
						? createLocalWorkflowCollectionNavigationData({
								...workflowContext,
								slug: config.slug,
								navigation
							})
						: null
				};
			}

			if (context.mode !== 'github') {
				return {
					type: 'collection-navigation-loaded',
					slug: config.slug,
					navigation: emptyCollectionNavigation()
				};
			}

			const cachedNavigation = !force
				? await githubRepositoryCache.getCollectionNavigation(config.slug)
				: null;

			await githubRepositoryCache.warmCollection(config.slug, {
				fetcher: context.fetcher,
				force,
				hydrateRemaining: hydrateRemaining ?? false,
				warmDocuments: false
			});

			const navigation =
				hydrateRemaining && cachedNavigation
					? cachedNavigation
					: ((await githubRepositoryCache.getCollectionNavigation(config.slug)) ??
						cachedNavigation);
			if (!navigation) {
				throw new Error('Failed to load collection navigation');
			}

			const result: PagesWorkspaceAdapterResult = {
				type: 'collection-navigation-loaded',
				slug: config.slug,
				navigation: {
					items: navigation.items ?? [],
					groups: navigation.groups ?? []
				}
			};

			if (hydrateRemaining === undefined) {
				globalThis.setTimeout(() => {
					void githubRepositoryCache
						.warmCollection(config.slug, {
							fetcher: context.fetcher,
							force: false,
							hydrateRemaining: true,
							warmDocuments: false
						})
						.catch((error) => {
							console.error(
								`Failed to hydrate remaining collection items for ${config.slug}:`,
								error
							);
						});
				}, 0);
			}

			return result;
		},

		async loadConfigStates({ force } = {}) {
			if (context.mode === 'local') {
				const configs = context.getConfigs();
				const statesBySlug = await loadLocalConfigStates(configs, context.getRootConfig());
				const workflowContext = getLocalWorkflowContext();
				return {
					type: 'config-states-loaded',
					statesBySlug,
					workflowData: workflowContext
						? createLocalWorkflowConfigStatesData({
								...workflowContext,
								statesBySlug,
								stateConfigCount: getConfigsWithTopLevelState(configs).length
							})
						: null
				};
			}

			if (context.mode !== 'github') {
				return {
					type: 'config-states-loaded',
					statesBySlug: {}
				};
			}

			const endpoint = context.resolveEndpoint('/api/repo/config-states');
			const currentConfig = context.getCurrentConfig();
			const response = await traceBrowserRequest(
				{
					workflow: currentConfig?.config.collection
						? 'desktop-collection-landing'
						: 'first-repository-open',
					route: context.getRoutePath(),
					endpoint,
					priority: force ? 'intent' : 'foreground',
					cacheTaskKey: null,
					duplicateState: 'unique'
				},
				() => context.fetcher(endpoint)
			);

			if (response.status === 401) {
				await context.redirectToExpiredSession();
				return { type: 'session-expired' };
			}

			if (!response.ok) {
				throw new Error(`Failed to load config states (${response.status})`);
			}

			const payload = (await response.json()) as ConfigStatesPayload;
			return {
				type: 'config-states-loaded',
				statesBySlug: payload.workflowData?.statesBySlug ?? payload.statesBySlug ?? {}
			};
		},

		async saveNavigation({ manifest }) {
			if (context.mode === 'local') {
				const backend = getLocalRepoBackend();
				await writeNavigationManifest(backend, manifest, {
					message: MANIFEST_COMMIT_MESSAGE
				});
				const refreshedManifest = await readNavigationManifestAfterRefresh(
					context.getNavigationManifest()
				);
				const configs = context.getConfigs();

				return {
					type: 'navigation-saved',
					message: 'Navigation saved.',
					mutation: createWorkflowMutationResult({
						mode: 'local',
						intent: {
							type: 'save-navigation-manifest'
						},
						message: 'Navigation saved.',
						changedPaths: ['tentman/navigation-manifest.json'],
						refresh: {
							workspace: true,
							remountWorkspace: true,
							navigationManifest: true,
							configStates: true,
							collections: configs.map((config) => config.slug)
						}
					}),
					invalidateWorkspace: true,
					localCollections: await loadLocalCollectionNavigations(
						configs,
						refreshedManifest,
						context.getRootConfig()
					),
					localConfigStates: await loadLocalConfigStates(configs, context.getRootConfig())
				};
			}

			const response = await context.fetcher(
				context.resolveEndpoint('/api/repo/navigation-manifest'),
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						action: 'save-manifest',
						manifest
					})
				}
			);

			if (response.status === 401) {
				await context.redirectToExpiredSession();
				return { type: 'session-expired' };
			}

			if (!response.ok) {
				throw new Error('Failed to save navigation manifest');
			}

			const result = (await response.json()) as {
				branchName?: string | null;
				changedPaths?: string[] | null;
				mutation?: unknown;
			};
			setDraftBranch(result.branchName, context.selectedRepo);
			await invalidateNavigationManifestCache(context);

			return {
				type: 'navigation-saved',
				message: 'Navigation saved.',
				mutation: createWorkflowMutationResult({
					mode: 'github',
					intent: {
						type: 'save-navigation-manifest'
					},
					message: 'Navigation saved.',
					changedPaths: result.changedPaths ?? ['tentman/navigation-manifest.json'],
					refresh: {
						workspace: true,
						navigationManifest: true,
						cachePaths: result.changedPaths ?? ['tentman/navigation-manifest.json']
					}
				}),
				invalidateWorkspace: true
			};
		},

		async saveCollectionOrder({ config, collection }) {
			if (!config.config._tentmanId) {
				throw new Error('Collection is missing a stable Tentman ID.');
			}

			if (context.mode === 'local') {
				const backend = getLocalRepoBackend();
				await saveCollectionOrder(backend, config, collection, context.getNavigationManifest(), {
					message: MANIFEST_COMMIT_MESSAGE
				});
				const refreshedManifest = await readNavigationManifestAfterRefresh(
					context.getNavigationManifest()
				);
				const configs = context.getConfigs();

				return {
					type: 'collection-order-saved',
					message: `${config.config.label} order saved.`,
					slug: config.slug,
					mutation: createWorkflowMutationResult({
						mode: 'local',
						intent: {
							type: 'save-collection-order',
							slug: config.slug
						},
						message: `${config.config.label} order saved.`,
						changedPaths: ['tentman/navigation-manifest.json'],
						refresh: {
							workspace: true,
							remountWorkspace: true,
							navigationManifest: true,
							configStates: true,
							collections: configs.map((entry) => entry.slug)
						}
					}),
					invalidateWorkspace: true,
					localCollections: await loadLocalCollectionNavigations(
						configs,
						refreshedManifest,
						context.getRootConfig()
					),
					localConfigStates: await loadLocalConfigStates(configs, context.getRootConfig())
				};
			}

			const response = await context.fetcher(
				context.resolveEndpoint('/api/repo/navigation-manifest'),
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						action: 'save-collection-order',
						collection: config.slug,
						order: collection
					})
				}
			);

			if (response.status === 401) {
				await context.redirectToExpiredSession();
				return { type: 'session-expired' };
			}

			if (!response.ok) {
				throw new Error('Failed to save collection order');
			}

			const result = (await response.json()) as {
				branchName?: string | null;
				changedPaths?: string[] | null;
			};
			setDraftBranch(result.branchName, context.selectedRepo);
			await invalidateNavigationManifestCache(context);

			const collectionResult = await adapter.loadCollectionNavigation({
				config,
				force: true
			});
			const navigation =
				collectionResult.type === 'collection-navigation-loaded'
					? collectionResult.navigation
					: undefined;

			return {
				type: 'collection-order-saved',
				message: `${config.config.label} order saved.`,
				slug: config.slug,
				mutation: createWorkflowMutationResult({
					mode: 'github',
					intent: {
						type: 'save-collection-order',
						slug: config.slug
					},
					message: `${config.config.label} order saved.`,
					changedPaths: result.changedPaths ?? ['tentman/navigation-manifest.json'],
					refresh: {
						workspace: true,
						navigationManifest: true,
						collections: [config.slug],
						cachePaths: result.changedPaths ?? ['tentman/navigation-manifest.json']
					}
				}),
				invalidateWorkspace: true,
				navigation
			};
		},

		promoteRoute({ slug }) {
			if (context.mode === 'github') {
				githubRepositoryCache.promoteRoute({
					slug,
					fetcher: context.fetcher
				});
			}

			return { type: 'route-promoted' };
		},

		promoteCollectionItem({ slug, itemId }) {
			if (context.mode === 'github') {
				githubRepositoryCache.promoteRoute({
					slug,
					itemId,
					fetcher: context.fetcher
				});
			}

			return { type: 'route-promoted' };
		}
	};

	return adapter;
}
