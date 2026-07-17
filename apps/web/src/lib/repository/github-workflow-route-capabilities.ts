import type { SerializablePackageBlock } from '$lib/blocks/packages';
import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import type { RepoConfigsBootstrap } from '$lib/repository/config-bootstrap';
import {
	createWorkflowBlockSupportData,
	createWorkflowPageViewData,
	createWorkflowRouteDataIdentity,
	type WorkflowCollectionNavigationData,
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
	branch: string | null | undefined;
	pageSlug: string;
	mode: 'github';
	workflowData?: WorkflowPageViewData | null;
}

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

	return {
		discoveredConfig: input.discoveredConfig,
		blockConfigs: input.blockConfigs,
		packageBlocks: input.packageBlocks,
		blockRegistryError: input.blockRegistryError,
		content: input.content,
		contentError: null,
		branch: input.bootstrap.activeDraftBranch,
		pageSlug: input.slug,
		mode: 'github',
		workflowData: createWorkflowPageViewData({
			identity: createWorkflowRouteDataIdentity(input.bootstrap.repositoryIdentity, {
				hasEditableDraft: Boolean(input.bootstrap.activeDraftBranch)
			}),
			slug: input.slug,
			discoveredConfig: input.discoveredConfig,
			content: input.content,
			collectionNavigation: null,
			blockSupport,
			cacheMiss: blockSupport.cacheMiss
		})
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

		const data = (await response.json()) as GitHubSingletonEditWorkflowData;

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
