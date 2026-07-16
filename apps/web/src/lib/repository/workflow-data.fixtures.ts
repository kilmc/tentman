import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import {
	createWorkflowBlockSupportData,
	createWorkflowCacheMissResult,
	createWorkflowCollectionNavigationData,
	createWorkflowConfigStatesData,
	createWorkflowFreshnessData,
	createWorkflowItemViewData,
	createWorkflowPageViewData,
	createWorkflowRouteDataIdentity,
	createWorkflowWorkspaceBootstrapData
} from '$lib/repository/workflow-data';
import type {
	RepoBootstrapIdentity,
	RepoConfigsBootstrap,
	RepoFreshnessIdentityResult
} from '$lib/repository/config-bootstrap';

export const workflowRootConfigFixture: RootConfig = {
	siteName: 'Acme Docs',
	configsDir: 'tentman/configs',
	blocksDir: 'tentman/blocks'
};

export const workflowPageConfigFixture: DiscoveredConfig = {
	slug: 'posts',
	path: 'tentman/configs/posts.tentman.json',
	config: {
		type: 'content',
		label: 'Posts',
		collection: true,
		content: {
			mode: 'directory',
			path: '../../src/content/posts',
			template: '../../src/content/posts/_template.md'
		},
		blocks: [
			{
				id: 'title',
				type: 'text',
				label: 'Title'
			},
			{
				id: 'published',
				type: 'toggle',
				label: 'Published'
			}
		]
	}
};

export const workflowNavigationManifestFixture: NavigationManifestState = {
	path: 'tentman/navigation-manifest.json',
	exists: true,
	error: null,
	manifest: {
		version: 1,
		collections: {
			posts: {
				items: [{ id: 'hello-world' }],
				groups: [
					{
						id: 'guides',
						value: 'guides',
						label: 'Guides',
						items: [{ id: 'hello-world' }]
					}
				]
			}
		}
	}
};

export const workflowBlockConfigFixture: DiscoveredBlockConfig = {
	id: 'callout',
	path: 'tentman/blocks/callout.tentman.json',
	config: {
		type: 'block',
		id: 'callout',
		label: 'Callout',
		blocks: [
			{
				id: 'body',
				type: 'markdown',
				label: 'Body'
			}
		]
	}
};

export const workflowRepositoryIdentityFixture: RepoBootstrapIdentity = {
	mode: 'github',
	repoKey: 'github:acme/docs',
	label: 'acme/docs',
	ref: 'opaque-active-source',
	headSha: 'opaque-head',
	treeSha: 'opaque-tree',
	resolvedAt: 1_811_427_200_000
};

export const workflowRouteDataIdentityFixture = createWorkflowRouteDataIdentity(
	workflowRepositoryIdentityFixture,
	{
		hasEditableDraft: true
	}
);

export const workflowBootstrapFixture = createWorkflowWorkspaceBootstrapData({
	configs: [workflowPageConfigFixture],
	blockConfigs: [workflowBlockConfigFixture],
	rootConfig: workflowRootConfigFixture,
	navigationManifest: workflowNavigationManifestFixture,
	singletonContentIdentities: {
		about: {
			path: 'src/content/about.md',
			blobSha: 'opaque-content'
		}
	},
	activeDraftBranch: 'opaque-edit-context',
	repositoryIdentity: workflowRepositoryIdentityFixture,
	mainRepositoryIdentity: null,
	draftRepositoryIdentity: workflowRepositoryIdentityFixture,
	changedPaths: ['src/content/posts/hello-world.md']
} satisfies RepoConfigsBootstrap);

export const workflowCollectionNavigationFixture = createWorkflowCollectionNavigationData({
	identity: workflowRouteDataIdentityFixture,
	slug: 'posts',
	navigation: {
		items: [
			{
				itemId: 'hello-world',
				title: 'Hello world',
				sortDate: null,
				sortValues: {
					title: 'Hello world'
				}
			}
		],
		groups: [
			{
				id: 'guides',
				label: 'Guides',
				items: [
					{
						itemId: 'hello-world',
						title: 'Hello world',
						sortDate: null
					}
				]
			}
		]
	}
});

export const workflowBlockSupportFixture = createWorkflowBlockSupportData({
	blockConfigs: [workflowBlockConfigFixture],
	packageBlocks: [
		{
			packageName: '@acme/tentman-blocks',
			config: {
				type: 'block',
				id: 'hero',
				label: 'Hero',
				blocks: [
					{
						id: 'headline',
						type: 'text',
						label: 'Headline'
					}
				]
			}
		}
	],
	blockRegistryError: null
});

export const workflowPageViewFixture = createWorkflowPageViewData({
	identity: workflowRouteDataIdentityFixture,
	slug: 'posts',
	discoveredConfig: workflowPageConfigFixture,
	content: null,
	collectionNavigation: workflowCollectionNavigationFixture.navigation,
	blockSupport: workflowBlockSupportFixture,
	contentError: null
});

export const workflowItemViewFixture = createWorkflowItemViewData({
	identity: workflowRouteDataIdentityFixture,
	slug: 'posts',
	itemId: 'hello-world',
	discoveredConfig: workflowPageConfigFixture,
	item: {
		_tentmanId: 'tent_hello',
		_filename: 'hello-world.md',
		title: 'Hello world',
		published: true
	},
	navigationManifest: workflowNavigationManifestFixture,
	blockSupport: workflowBlockSupportFixture,
	contentError: null
});

export const workflowConfigStatesFixture = createWorkflowConfigStatesData({
	identity: workflowRouteDataIdentityFixture,
	statesBySlug: {
		posts: {
			value: true,
			label: 'Published',
			variant: 'success',
			icon: 'circle-check',
			visibility: {
				navigation: true,
				header: true,
				card: true
			}
		}
	},
	stateConfigCount: 1
});

export const workflowFreshnessFixture = createWorkflowFreshnessData({
	activeDraftBranch: 'opaque-edit-context',
	repositoryIdentity: workflowRepositoryIdentityFixture,
	mainRepositoryIdentity: null,
	draftRepositoryIdentity: workflowRepositoryIdentityFixture,
	unchanged: false,
	freshnessStatus: 'changed',
	changedPaths: ['src/content/posts/hello-world.md'],
	error: null,
	recovery: null
} satisfies RepoFreshnessIdentityResult);

export const workflowCacheMissFixture = createWorkflowCacheMissResult({
	target: 'item-view',
	slug: 'posts',
	itemId: 'missing-item',
	reason: 'item document is not available in prepared route data',
	recovery: 'fetch-route-data'
});
