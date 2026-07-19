import type { SerializablePackageBlock } from '$lib/blocks/packages';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import {
	createWorkflowBlockSupportData,
	createWorkflowEditorState,
	createWorkflowItemViewData,
	createWorkflowPageViewData,
	createWorkflowRouteDataIdentityFromRepositoryIdentity,
	createWorkflowRouteDataIdentity,
	type WorkflowCollectionNavigationData,
	type WorkflowEditorState,
	type WorkflowItemViewData,
	type WorkflowPageViewData
} from '$lib/repository/workflow-data';
import { githubRepositoryCache } from '$lib/stores/github-repository-cache';
import { buildPathWithQuery } from '$lib/utils/routing';

export type GitHubRouteWorkflowPriority = 'foreground' | 'intent' | 'topLevel' | 'passive';

export interface GitHubRouteWorkflowContext {
	repoFullName: string;
	bootstrap: RepoConfigsBootstrap;
}

type WithGitHubRouteWorkflowContext<T> = GitHubRouteWorkflowContext & T;

export interface GitHubSingletonEditWorkflowData {
	discoveredConfig: DiscoveredConfig;
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
	content: ContentDocument | null;
	contentError: string | null;
	editor: WorkflowEditorState;
	pageSlug: string;
	mode: 'github';
	workflowData?: WorkflowPageViewData | null;
}

export type GitHubPageViewRouteData = {
	discoveredConfig: DiscoveredConfig | null;
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
	content: ContentDocument | null;
	collectionNavigation: WorkflowPageViewData['collectionNavigation'];
	contentError: string | null;
	editor: WorkflowEditorState;
	pageSlug: string;
	mode: 'github';
	workflowData: WorkflowPageViewData;
};

export type GitHubItemViewRouteData = {
	discoveredConfig: DiscoveredConfig | null;
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
	navigationManifest: WorkflowItemViewData['navigationManifest'];
	item: ContentRecord | null;
	existingItems?: ContentRecord[];
	contentError: string | null;
	editor: WorkflowEditorState;
	itemId: string;
	pageSlug: string;
	mode: 'github';
	workflowData: WorkflowItemViewData;
};

type GitHubPageViewTransportData = Partial<GitHubPageViewRouteData> & {
	branch?: string | null;
	editor?: WorkflowEditorState | null;
	workflowData?: (Partial<WorkflowPageViewData> & { editor?: WorkflowEditorState | null }) | null;
};

type GitHubItemViewTransportData = Partial<GitHubItemViewRouteData> & {
	branch?: string | null;
	editor?: WorkflowEditorState | null;
	workflowData?: (Partial<WorkflowItemViewData> & { editor?: WorkflowEditorState | null }) | null;
};

export type GitHubSingletonEditWorkflowResult =
	| {
			status: 'ready';
			data: GitHubSingletonEditWorkflowData;
	  }
	| {
			status: 'collection';
	  }
	| {
			status: 'unauthorized';
	  }
	| {
			status: 'missing';
	  }
	| {
			status: 'error';
			httpStatus: number;
	  };

async function hydrateGitHubRouteWorkflow(input: GitHubRouteWorkflowContext): Promise<void> {
	await githubRepositoryCache.hydrateFromBootstrap({
		repoFullName: input.repoFullName,
		bootstrap: input.bootstrap
	});
}

function createCachedSingletonEditWorkflowData(input: {
	bootstrap: RepoConfigsBootstrap;
	slug: string;
	discoveredConfig: DiscoveredConfig;
	content: ContentRecord | null;
	blockConfigs: DiscoveredBlockConfig[];
	packageBlocks: SerializablePackageBlock[];
	blockRegistryError: string | null;
}): GitHubSingletonEditWorkflowData {
	const blockSupport = createWorkflowBlockSupportData({
		blockConfigs: input.blockConfigs,
		packageBlocks: input.packageBlocks,
		blockRegistryError: input.blockRegistryError
	});
	const identity = createWorkflowRouteDataIdentity(input.bootstrap.repositoryIdentity, {
		hasEditableDraft: Boolean(input.bootstrap.activeDraftBranch)
	});
	const workflowData = createWorkflowPageViewData({
		identity,
		slug: input.slug,
		discoveredConfig: input.discoveredConfig,
		content: input.content,
		collectionNavigation: null,
		blockSupport,
		cacheMiss: blockSupport.cacheMiss
	});

	return {
		discoveredConfig: input.discoveredConfig,
		blockConfigs: input.blockConfigs,
		packageBlocks: input.packageBlocks,
		blockRegistryError: input.blockRegistryError,
		content: input.content,
		contentError: null,
		editor: workflowData.editor,
		pageSlug: input.slug,
		mode: 'github',
		workflowData
	};
}

function createGitHubTransportWorkflowIdentity(input: {
	repoFullName: string;
	bootstrap: RepoConfigsBootstrap;
	hasEditableDraft: boolean;
}) {
	return createWorkflowRouteDataIdentityFromRepositoryIdentity({
		mode: 'github',
		workspaceKey: `github:${input.repoFullName}`,
		workspaceLabel: input.repoFullName,
		repositoryIdentity: input.bootstrap.repositoryIdentity ?? null,
		hasEditableDraft: input.hasEditableDraft
	});
}

function getTransportDraftStatus(input: {
	branch?: string | null;
	editor?: WorkflowEditorState | null;
	workflowData?: {
		identity?: { hasEditableDraft?: boolean } | null;
		editor?: WorkflowEditorState | null;
	} | null;
	bootstrap: RepoConfigsBootstrap;
}): boolean {
	return Boolean(
		input.workflowData?.identity?.hasEditableDraft ??
		input.workflowData?.editor?.isDraft ??
		input.editor?.isDraft ??
		input.branch ??
		input.bootstrap.activeDraftBranch
	);
}

export function normalizeGitHubPageViewRouteData(input: {
	repoFullName: string;
	bootstrap: RepoConfigsBootstrap;
	slug: string;
	data: GitHubPageViewTransportData;
}): GitHubPageViewRouteData {
	const { branch, ...data } = input.data;
	const identity = createGitHubTransportWorkflowIdentity({
		repoFullName: input.repoFullName,
		bootstrap: input.bootstrap,
		hasEditableDraft: getTransportDraftStatus({
			branch,
			editor: data.editor,
			workflowData: data.workflowData,
			bootstrap: input.bootstrap
		})
	});
	const workflowData = data.workflowData?.blockSupport
		? data.workflowData
		: createWorkflowPageViewData({
				identity,
				slug: input.slug,
				discoveredConfig: data.discoveredConfig ?? null,
				content: data.content ?? null,
				collectionNavigation: data.collectionNavigation ?? null,
				blockSupport: createWorkflowBlockSupportData({
					blockConfigs: data.blockConfigs ?? [],
					packageBlocks: data.packageBlocks ?? [],
					blockRegistryError: data.blockRegistryError ?? null
				}),
				contentError: data.contentError ?? null
			});
	const editor =
		data.editor ??
		data.workflowData?.editor ??
		workflowData.editor ??
		createWorkflowEditorState(identity);

	return {
		discoveredConfig: data.discoveredConfig ?? workflowData.discoveredConfig,
		blockConfigs: data.blockConfigs ?? workflowData.blockSupport.blockConfigs,
		packageBlocks: data.packageBlocks ?? workflowData.blockSupport.packageBlocks,
		blockRegistryError: data.blockRegistryError ?? workflowData.blockSupport.error,
		content: data.content ?? workflowData.content,
		collectionNavigation: data.collectionNavigation ?? workflowData.collectionNavigation,
		contentError: data.contentError ?? workflowData.contentError,
		editor,
		pageSlug: data.pageSlug ?? input.slug,
		mode: 'github',
		workflowData: {
			...workflowData,
			editor
		}
	};
}

function normalizeSingletonEditWorkflowData(
	input: Parameters<typeof normalizeGitHubPageViewRouteData>[0]
): GitHubSingletonEditWorkflowData {
	return normalizeGitHubPageViewRouteData(input) as GitHubSingletonEditWorkflowData;
}

export function normalizeGitHubItemViewRouteData(input: {
	repoFullName: string;
	bootstrap: RepoConfigsBootstrap;
	slug: string;
	itemId: string;
	data: GitHubItemViewTransportData;
}): GitHubItemViewRouteData {
	const { branch, ...data } = input.data;
	const identity = createGitHubTransportWorkflowIdentity({
		repoFullName: input.repoFullName,
		bootstrap: input.bootstrap,
		hasEditableDraft: getTransportDraftStatus({
			branch,
			editor: data.editor,
			workflowData: data.workflowData,
			bootstrap: input.bootstrap
		})
	});
	const workflowData = data.workflowData?.blockSupport
		? data.workflowData
		: createWorkflowItemViewData({
				identity,
				slug: input.slug,
				itemId: input.itemId,
				discoveredConfig: data.discoveredConfig ?? null,
				item: data.item ?? null,
				navigationManifest: data.navigationManifest ?? null,
				blockSupport: createWorkflowBlockSupportData({
					blockConfigs: data.blockConfigs ?? [],
					packageBlocks: data.packageBlocks ?? [],
					blockRegistryError: data.blockRegistryError ?? null
				}),
				contentError: data.contentError ?? null
			});
	const editor =
		data.editor ??
		data.workflowData?.editor ??
		workflowData.editor ??
		createWorkflowEditorState(identity);

	return {
		discoveredConfig: data.discoveredConfig ?? workflowData.discoveredConfig,
		blockConfigs: data.blockConfigs ?? workflowData.blockSupport.blockConfigs,
		packageBlocks: data.packageBlocks ?? workflowData.blockSupport.packageBlocks,
		blockRegistryError: data.blockRegistryError ?? workflowData.blockSupport.error,
		navigationManifest: data.navigationManifest ?? workflowData.navigationManifest,
		item: data.item ?? workflowData.item,
		existingItems: data.existingItems,
		contentError: data.contentError ?? workflowData.contentError,
		editor,
		itemId: data.itemId ?? input.itemId,
		pageSlug: data.pageSlug ?? input.slug,
		mode: 'github',
		workflowData: {
			...workflowData,
			editor
		}
	};
}

async function writeSingletonEditWorkflowData(input: {
	slug: string;
	content: ContentRecord | null;
	blockConfigs?: DiscoveredBlockConfig[];
	packageBlocks?: SerializablePackageBlock[];
	blockRegistryError?: string | null;
}): Promise<void> {
	await githubRepositoryCache.setSingletonPageView({
		slug: input.slug,
		content: input.content,
		blockConfigs: input.blockConfigs,
		packageBlocks: input.packageBlocks,
		blockRegistryError: input.blockRegistryError
	});
}

export const githubWorkflowRouteCapabilities = {
	async loadCollectionNavigationWorkflowData(
		input: WithGitHubRouteWorkflowContext<{
			slug: string;
			fetcher: typeof fetch;
			visibleLimit?: number;
			force?: boolean;
		}>
	): Promise<WorkflowCollectionNavigationData> {
		await hydrateGitHubRouteWorkflow(input);
		return await githubRepositoryCache.loadCollectionNavigationWorkflowData(input.slug, {
			fetcher: input.fetcher,
			visibleLimit: input.visibleLimit,
			force: input.force
		});
	},

	async loadPageViewWorkflowData(
		input: WithGitHubRouteWorkflowContext<{
			slug: string;
			fetcher: typeof fetch;
			priority?: GitHubRouteWorkflowPriority;
		}>
	): Promise<WorkflowPageViewData> {
		await hydrateGitHubRouteWorkflow(input);
		return await githubRepositoryCache.loadPageViewWorkflowData(input.slug, {
			fetcher: input.fetcher,
			priority: input.priority
		});
	},

	async loadItemViewWorkflowData(
		input: WithGitHubRouteWorkflowContext<{
			slug: string;
			itemId: string;
			fetcher: typeof fetch;
			priority?: GitHubRouteWorkflowPriority;
			route?: string | null;
		}>
	): Promise<WorkflowItemViewData> {
		await hydrateGitHubRouteWorkflow(input);
		return await githubRepositoryCache.loadItemViewWorkflowData(input.slug, input.itemId, {
			fetcher: input.fetcher,
			priority: input.priority,
			route: input.route
		});
	},

	async loadExistingItemsForRoute(
		input: WithGitHubRouteWorkflowContext<{
			slug: string;
			fetcher: typeof fetch;
			priority?: GitHubRouteWorkflowPriority;
		}>
	): Promise<ContentRecord[]> {
		await hydrateGitHubRouteWorkflow(input);
		return await githubRepositoryCache.loadExistingItemsForRoute(input.slug, {
			fetcher: input.fetcher,
			priority: input.priority
		});
	},

	async loadSingletonEditWorkflowData(
		input: WithGitHubRouteWorkflowContext<{
			slug: string;
			fetcher: typeof fetch;
		}>
	): Promise<GitHubSingletonEditWorkflowResult> {
		await hydrateGitHubRouteWorkflow(input);
		const discoveredConfig =
			input.bootstrap.configs?.find((config) => config.slug === input.slug) ?? null;
		const cachedSingleton = await githubRepositoryCache.getSingletonDocumentForRoute({
			slug: input.slug
		});

		if (discoveredConfig && cachedSingleton?.blockSupport) {
			if (discoveredConfig.config.collection) {
				return { status: 'collection' };
			}

			return {
				status: 'ready',
				data: createCachedSingletonEditWorkflowData({
					bootstrap: input.bootstrap,
					slug: input.slug,
					discoveredConfig,
					content: cachedSingleton.content,
					blockConfigs: cachedSingleton.blockSupport.blockConfigs,
					packageBlocks: cachedSingleton.blockSupport.packageBlocks,
					blockRegistryError: cachedSingleton.blockSupport.blockRegistryError
				})
			};
		}

		const response = await input.fetcher(
			buildPathWithQuery('/api/repo/page-view', {
				slug: input.slug
			})
		);

		if (response.status === 401) {
			return { status: 'unauthorized' };
		}
		if (response.status === 404) {
			return { status: 'missing' };
		}
		if (!response.ok) {
			return { status: 'error', httpStatus: response.status };
		}

		const data = normalizeSingletonEditWorkflowData({
			repoFullName: input.repoFullName,
			bootstrap: input.bootstrap,
			slug: input.slug,
			data: await response.json()
		});

		if (data?.discoveredConfig?.config?.collection) {
			return { status: 'collection' };
		}

		const cacheableContent = data.content && !Array.isArray(data.content) ? data.content : null;
		await writeSingletonEditWorkflowData({
			slug: input.slug,
			content: cacheableContent,
			blockConfigs: data.blockConfigs,
			packageBlocks: data.packageBlocks,
			blockRegistryError: data.blockRegistryError ?? null
		});

		return { status: 'ready', data };
	}
};
