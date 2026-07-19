import { get } from 'svelte/store';
import type { BlockRegistry } from '$lib/blocks/registry';
import type { SerializablePackageBlock } from '$lib/blocks/packages';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import {
	deleteContentDocument,
	fetchContentDocument,
	saveContentDocument
} from '$lib/content/service';
import { materializeDraftAssets } from '$lib/features/draft-assets/materialize';
import { findContentItemByRoute } from '$lib/features/content-management/item';
import type { ContentRecord } from '$lib/features/content-management/types';
import {
	manageCollectionGroups,
	syncCollectionItemGroupSelection,
	type NavigationManifest,
	type NavigationManifestState
} from '$lib/features/content-management/navigation-manifest';
import { buildCollectionFilePath } from '$lib/features/content-management/transforms';
import { localContent } from '$lib/stores/local-content';
import { localRepo } from '$lib/stores/local-repo';
import { resolveConfigPath } from '$lib/utils/validation';
import {
	createLocalWorkflowItemViewData,
	createLocalWorkflowPageViewData
} from './local-workflow-data';
import { createWorkflowMutationResult, type WorkflowMutationResult } from './workflow-mutations';
import type { WorkflowItemViewData, WorkflowPageViewData } from './workflow-data';

type ResolveRoutePath = (path: string) => string;

interface LocalRouteWorkflowBaseData {
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistry: BlockRegistry | null;
	blockRegistryError: string | null;
	rootConfig: RootConfig | null;
	recoveryContextKey: string;
}

export interface LocalSingletonEditWorkflowData extends LocalRouteWorkflowBaseData {
	discoveredConfig: DiscoveredConfig | null;
	content: ContentRecord | null;
	contentError: string | null;
	workflowData: WorkflowPageViewData | null;
}

export interface LocalItemEditWorkflowData extends LocalRouteWorkflowBaseData {
	discoveredConfig: DiscoveredConfig | null;
	item: ContentRecord | null;
	existingItems: ContentRecord[];
	navigationManifest: NavigationManifestState | null;
	contentError: string | null;
	workflowData: WorkflowItemViewData | null;
}

export interface LocalEditMutationResult {
	mutation: WorkflowMutationResult;
}

function getLocalBackend() {
	const repoState = get(localRepo);
	if (!repoState.backend) {
		throw new Error('No local repository is open.');
	}

	return repoState.backend;
}

function getOptionalLocalBackend() {
	return get(localRepo).backend;
}

function getRecoveryContextKey() {
	return `local:${getOptionalLocalBackend()?.cacheKey ?? 'none'}`;
}

function getContentPath(discoveredConfig: DiscoveredConfig): string[] {
	if (typeof discoveredConfig.config.content.path !== 'string') {
		return [];
	}

	return [resolveConfigPath(discoveredConfig.path, discoveredConfig.config.content.path)];
}

function getItemContentPath(input: {
	discoveredConfig: DiscoveredConfig;
	item: ContentRecord | null;
}): string[] {
	if (typeof input.discoveredConfig.config.content.path !== 'string') {
		return [];
	}

	const contentPath = resolveConfigPath(
		input.discoveredConfig.path,
		input.discoveredConfig.config.content.path
	);
	const itemPath =
		input.discoveredConfig.config.content.mode === 'directory'
			? typeof input.item?._filename === 'string'
				? buildCollectionFilePath(contentPath, input.item._filename)
				: null
			: contentPath;

	return itemPath ? [itemPath] : [];
}

async function refreshLocalContent(options?: { force?: boolean }) {
	await localContent.refresh(options);
	return get(localContent);
}

function createLocalRouteBaseData(): LocalRouteWorkflowBaseData {
	const contentState = get(localContent);

	return {
		blockConfigs: contentState.blockConfigs,
		packageBlocks: [],
		blockRegistry: contentState.blockRegistry,
		blockRegistryError: contentState.blockRegistryError,
		rootConfig: contentState.rootConfig,
		recoveryContextKey: getRecoveryContextKey()
	};
}

function createSingletonWorkflowData(input: {
	slug: string;
	discoveredConfig: DiscoveredConfig | null;
	content: ContentRecord | null;
	contentError: string | null;
}): WorkflowPageViewData | null {
	const backend = getOptionalLocalBackend();
	const contentState = get(localContent);
	if (!backend) {
		return null;
	}

	return createLocalWorkflowPageViewData({
		backend,
		discoverySignature: contentState.discoverySignature ?? null,
		slug: input.slug,
		discoveredConfig: input.discoveredConfig,
		content: input.content,
		collectionNavigation: null,
		blockConfigs: contentState.blockConfigs,
		blockRegistryError: contentState.blockRegistryError,
		contentError: input.contentError
	});
}

function createItemWorkflowData(input: {
	slug: string;
	itemId: string;
	discoveredConfig: DiscoveredConfig | null;
	item: ContentRecord | null;
	contentError: string | null;
}): WorkflowItemViewData | null {
	const backend = getOptionalLocalBackend();
	const contentState = get(localContent);
	if (!backend) {
		return null;
	}

	return createLocalWorkflowItemViewData({
		backend,
		discoverySignature: contentState.discoverySignature ?? null,
		slug: input.slug,
		itemId: input.itemId,
		discoveredConfig: input.discoveredConfig,
		item: input.item,
		navigationManifest: contentState.navigationManifest,
		blockConfigs: contentState.blockConfigs,
		blockRegistryError: contentState.blockRegistryError,
		contentError: input.contentError
	});
}

export const localWorkflowRouteCapabilities = {
	getRecoveryContextKey,

	async loadSingletonEditWorkflowData(input: {
		slug: string;
	}): Promise<LocalSingletonEditWorkflowData> {
		const contentState = await refreshLocalContent();
		const backend = getOptionalLocalBackend();
		const discoveredConfig =
			contentState.configs.find((entry) => entry.slug === input.slug) ?? null;
		const baseData = createLocalRouteBaseData();

		if (!backend || !discoveredConfig) {
			const contentError = 'Configuration not found';
			return {
				...baseData,
				discoveredConfig,
				content: null,
				contentError,
				workflowData: createSingletonWorkflowData({
					slug: input.slug,
					discoveredConfig,
					content: null,
					contentError
				})
			};
		}

		try {
			const loadedContent = await fetchContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path
			);
			const content = Array.isArray(loadedContent) ? null : loadedContent;
			const contentError = Array.isArray(loadedContent) ? 'Expected singleton content' : null;

			return {
				...baseData,
				discoveredConfig,
				content,
				contentError,
				workflowData: createSingletonWorkflowData({
					slug: input.slug,
					discoveredConfig,
					content,
					contentError
				})
			};
		} catch (error) {
			const contentError = error instanceof Error ? error.message : 'Failed to load content';
			return {
				...baseData,
				discoveredConfig,
				content: null,
				contentError,
				workflowData: createSingletonWorkflowData({
					slug: input.slug,
					discoveredConfig,
					content: null,
					contentError
				})
			};
		}
	},

	async loadItemEditWorkflowData(input: {
		slug: string;
		itemId: string;
	}): Promise<LocalItemEditWorkflowData> {
		const contentState = await refreshLocalContent();
		const backend = getOptionalLocalBackend();
		const discoveredConfig =
			contentState.configs.find((entry) => entry.slug === input.slug) ?? null;
		const baseData = createLocalRouteBaseData();
		const navigationManifest = contentState.navigationManifest;

		if (!backend || !discoveredConfig) {
			const contentError = 'Configuration not found';
			return {
				...baseData,
				discoveredConfig,
				item: null,
				existingItems: [],
				navigationManifest,
				contentError,
				workflowData: createItemWorkflowData({
					slug: input.slug,
					itemId: input.itemId,
					discoveredConfig,
					item: null,
					contentError
				})
			};
		}

		try {
			const loadedContent = await fetchContentDocument(
				backend,
				discoveredConfig.config,
				discoveredConfig.path
			);
			const existingItems = Array.isArray(loadedContent) ? loadedContent : [];
			const item =
				Array.isArray(loadedContent)
					? (findContentItemByRoute(loadedContent, discoveredConfig.config, input.itemId) ??
						null)
					: null;

			return {
				...baseData,
				discoveredConfig,
				item,
				existingItems,
				navigationManifest,
				contentError: null,
				workflowData: createItemWorkflowData({
					slug: input.slug,
					itemId: input.itemId,
					discoveredConfig,
					item,
					contentError: null
				})
			};
		} catch (error) {
			const contentError = error instanceof Error ? error.message : 'Failed to load content';
			return {
				...baseData,
				discoveredConfig,
				item: null,
				existingItems: [],
				navigationManifest,
				contentError,
				workflowData: createItemWorkflowData({
					slug: input.slug,
					itemId: input.itemId,
					discoveredConfig,
					item: null,
					contentError
				})
			};
		}
	},

	async saveSingletonEditContent(input: {
		discoveredConfig: DiscoveredConfig;
		content: ContentRecord;
		resolveRoutePath: ResolveRoutePath;
	}): Promise<LocalEditMutationResult> {
		const backend = getLocalBackend();
		const materialized = await materializeDraftAssets({
			backend,
			content: input.content
		});
		await saveContentDocument(
			backend,
			input.discoveredConfig.config,
			input.discoveredConfig.path,
			materialized.content
		);

		const changedPaths = getContentPath(input.discoveredConfig);
		const mutation = createWorkflowMutationResult({
			mode: 'local',
			intent: {
				type: 'save-content',
				slug: input.discoveredConfig.slug,
				target: 'singleton'
			},
			message: 'Changes saved to local files.',
			changedPaths,
			redirect: {
				href: input.resolveRoutePath(`/pages/${input.discoveredConfig.slug}/edit`) + '?published=true'
			},
			recoveryCleanup: {
				clearEditorRecovery: true,
				draftAssetRefs: materialized.cleanedRefs
			},
			refresh: {
				workspace: true,
				cachePaths: changedPaths
			}
		});

		await refreshLocalContent({ force: true });
		return { mutation };
	},

	async saveItemEditContent(input: {
		discoveredConfig: DiscoveredConfig;
		itemId: string;
		item: ContentRecord | null;
		content: ContentRecord;
		navigationManifest: NavigationManifest | null;
		resolveRoutePath: ResolveRoutePath;
	}): Promise<LocalEditMutationResult> {
		const backend = getLocalBackend();
		const materialized = await materializeDraftAssets({
			backend,
			content: input.content
		});
		await saveContentDocument(
			backend,
			input.discoveredConfig.config,
			input.discoveredConfig.path,
			materialized.content,
			input.discoveredConfig.config.content.mode === 'directory'
				? { filename: input.item?._filename }
				: { itemId: input.itemId }
		);
		await syncCollectionItemGroupSelection(
			backend,
			input.discoveredConfig,
			materialized.content,
			input.navigationManifest,
			{
				message: 'Update Tentman navigation manifest'
			}
		);

		const changedPaths = getItemContentPath({
			discoveredConfig: input.discoveredConfig,
			item: input.item
		});
		const mutation = createWorkflowMutationResult({
			mode: 'local',
			intent: {
				type: 'save-content',
				slug: input.discoveredConfig.slug,
				target: 'collection-item',
				itemId: input.itemId
			},
			message: 'Changes saved to local files.',
			changedPaths,
			redirect: {
				href:
					input.resolveRoutePath(`/pages/${input.discoveredConfig.slug}/${input.itemId}/edit`) +
					'?published=true'
			},
			recoveryCleanup: {
				clearEditorRecovery: true,
				draftAssetRefs: materialized.cleanedRefs
			},
			refresh: {
				workspace: true,
				collections: [input.discoveredConfig.slug],
				cachePaths: changedPaths
			}
		});

		await refreshLocalContent({ force: true });
		return { mutation };
	},

	async deleteItem(input: {
		discoveredConfig: DiscoveredConfig;
		itemId: string;
		item: ContentRecord | null;
		resolveRoutePath: ResolveRoutePath;
	}): Promise<LocalEditMutationResult> {
		const backend = getLocalBackend();
		await deleteContentDocument(
			backend,
			input.discoveredConfig.config,
			input.discoveredConfig.path,
			input.discoveredConfig.config.content.mode === 'directory'
				? { filename: input.item?._filename, itemId: input.itemId }
				: { itemId: input.itemId }
		);

		const changedPaths = getItemContentPath({
			discoveredConfig: input.discoveredConfig,
			item: input.item
		});
		const mutation = createWorkflowMutationResult({
			mode: 'local',
			intent: {
				type: 'delete-item',
				slug: input.discoveredConfig.slug,
				itemId: input.itemId
			},
			message: 'Item deleted from local files.',
			changedPaths,
			redirect: {
				href: `${input.resolveRoutePath(`/pages/${input.discoveredConfig.slug}`)}?deleted=true`
			},
			refresh: {
				workspace: true,
				collections: [input.discoveredConfig.slug],
				cachePaths: changedPaths
			}
		});

		await refreshLocalContent({ force: true });
		return { mutation };
	},

	async createCollectionGroup(input: {
		discoveredConfig: DiscoveredConfig;
		navigationManifest: NavigationManifest | null;
		id: string;
		value: string;
		label: string;
	}): Promise<NavigationManifestState> {
		const backend = getLocalBackend();
		await manageCollectionGroups(
			backend,
			input.discoveredConfig,
			{
				action: 'create',
				id: input.id,
				label: input.label,
				value: input.value
			},
			input.navigationManifest
		);
		const contentState = await refreshLocalContent({ force: true });
		return contentState.navigationManifest;
	}
};
