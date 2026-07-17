import { describe, expect, it } from 'vitest';
import type { DiscoveredConfig } from '$lib/config/discovery';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	createLocalWorkflowCollectionNavigationData,
	createLocalWorkflowConfigStatesData,
	createLocalWorkflowItemViewData,
	createLocalWorkflowPageViewData,
	createLocalWorkflowWorkspaceBootstrapData
} from './local-workflow-data';

const backend = {
	kind: 'local',
	cacheKey: 'local:docs',
	label: 'Docs',
	supportsDraftBranches: false
} as RepositoryBackend;

const discoverySignature = {
	rootConfigText: '{"siteName":"Docs"}',
	navigationManifestText: null,
	contentConfigPaths: ['content/posts.tentman.json'],
	contentConfigFiles: [
		{
			path: 'content/posts.tentman.json',
			content: '{"label":"Posts"}'
		}
	],
	blockConfigPaths: [],
	blockConfigFiles: [],
	contentComponentFiles: []
};

const postsConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		type: 'content',
		label: 'Posts',
		collection: true,
		content: {
			mode: 'file',
			path: 'src/content/posts.json'
		},
		blocks: []
	}
} as DiscoveredConfig;

const navigationManifest = {
	path: 'tentman/navigation-manifest.json',
	exists: true,
	manifest: {
		version: 1 as const,
		content: {
			items: [{ id: 'posts' }]
		}
	},
	error: null
};

describe('local workflow data', () => {
	it('builds local bootstrap data without draft or GitHub mechanics', () => {
		const workflowData = createLocalWorkflowWorkspaceBootstrapData({
			backend,
			configs: [postsConfig],
			blockConfigs: [],
			blockRegistryError: null,
			rootConfig: {
				siteName: 'Docs',
				local: {
					previewUrl: 'http://localhost:5173/'
				}
			},
			navigationManifest,
			discoverySignature
		});

		expect(workflowData).toMatchObject({
			identity: {
				mode: 'local',
				workspaceKey: 'local:docs',
				workspaceLabel: 'Docs',
				hasEditableDraft: false
			},
			rootConfig: {
				local: {
					previewUrl: 'http://localhost:5173/'
				}
			},
			configs: [postsConfig],
			blockSupport: {
				packageBlocks: [],
				readiness: 'ready'
			},
			freshness: {
				status: 'unchanged',
				changedContentPaths: []
			}
		});
	});

	it('builds local collection navigation and config states workflow outputs', () => {
		const navigation = {
			items: [
				{
					itemId: 'hello',
					title: 'Hello',
					sortDate: null
				}
			],
			groups: []
		};
		const collectionWorkflow = createLocalWorkflowCollectionNavigationData({
			backend,
			discoverySignature,
			slug: 'posts',
			navigation
		});
		const statesWorkflow = createLocalWorkflowConfigStatesData({
			backend,
			discoverySignature,
			statesBySlug: {
				posts: null
			},
			stateConfigCount: 1
		});

		expect(collectionWorkflow).toMatchObject({
			identity: {
				mode: 'local'
			},
			slug: 'posts',
			navigation,
			readiness: 'ready'
		});
		expect(statesWorkflow).toMatchObject({
			identity: {
				mode: 'local'
			},
			statesBySlug: {
				posts: null
			},
			stateConfigCount: 1,
			readiness: 'ready'
		});
	});

	it('builds local page and item workflow outputs from browser-read content', () => {
		const item = {
			_tentmanId: 'tent_hello',
			title: 'Hello'
		};
		const pageWorkflow = createLocalWorkflowPageViewData({
			backend,
			discoverySignature,
			slug: 'posts',
			discoveredConfig: postsConfig,
			content: [item],
			collectionNavigation: {
				items: [
					{
						itemId: 'hello',
						title: 'Hello',
						sortDate: null
					}
				],
				groups: []
			},
			blockConfigs: [],
			blockRegistryError: null,
			contentError: null
		});
		const itemWorkflow = createLocalWorkflowItemViewData({
			backend,
			discoverySignature,
			slug: 'posts',
			itemId: 'hello',
			discoveredConfig: postsConfig,
			item,
			navigationManifest,
			blockConfigs: [],
			blockRegistryError: null,
			contentError: null
		});

		expect(pageWorkflow).toMatchObject({
			slug: 'posts',
			discoveredConfig: postsConfig,
			content: [item],
			readiness: 'ready'
		});
		expect(itemWorkflow).toMatchObject({
			slug: 'posts',
			itemId: 'hello',
			item,
			navigationManifest,
			readiness: 'ready'
		});
	});
});
