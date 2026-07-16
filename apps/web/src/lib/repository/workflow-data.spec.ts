import { describe, expect, it } from 'vitest';
import {
	createWorkflowBlockSupportData,
	createWorkflowCacheMissResult,
	createWorkflowFreshnessData,
	createWorkflowPageViewData,
	createWorkflowRouteDataIdentity,
	createWorkflowWorkspaceBootstrapData
} from './workflow-data';
import {
	workflowBlockSupportFixture,
	workflowBootstrapFixture,
	workflowCacheMissFixture,
	workflowCollectionNavigationFixture,
	workflowConfigStatesFixture,
	workflowFreshnessFixture,
	workflowItemViewFixture,
	workflowNavigationManifestFixture,
	workflowPageConfigFixture,
	workflowPageViewFixture,
	workflowRepositoryIdentityFixture,
	workflowRootConfigFixture,
	workflowRouteDataIdentityFixture
} from './workflow-data.fixtures';

const TRANSPORT_MECHANIC_KEYS = [
	'ref',
	'headSha',
	'treeSha',
	'blobSha',
	'branch',
	'draftBranch',
	'activeDraftBranch',
	'repositoryIdentity',
	'mainRepositoryIdentity',
	'draftRepositoryIdentity',
	'singletonContentIdentities',
	'handle',
	'fileHandle',
	'directoryHandle',
	'discoverySignature',
	'directWrite',
	'source'
];

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
	if (!value || typeof value !== 'object') {
		return keys;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			collectObjectKeys(entry, keys);
		}
		return keys;
	}

	for (const [key, entry] of Object.entries(value)) {
		keys.add(key);
		collectObjectKeys(entry, keys);
	}

	return keys;
}

describe('workflow-data contract', () => {
	it('normalizes route-data identity without caller-facing repository mechanics', () => {
		const identity = createWorkflowRouteDataIdentity(workflowRepositoryIdentityFixture, {
			hasEditableDraft: true
		});

		expect(identity).toEqual({
			mode: 'github',
			workspaceKey: 'github:acme/docs',
			workspaceLabel: 'acme/docs',
			dataSetKey: expect.stringMatching(/^dataset:/),
			resolvedAt: 1811427200000,
			hasEditableDraft: true
		});
		expect(identity?.dataSetKey).not.toContain('opaque-active-source');
		expect(identity?.dataSetKey).not.toContain('opaque-head');
		expect(identity?.dataSetKey).not.toContain('opaque-tree');
	});

	it('provides representative mode-neutral fixtures for read-route workflow data', () => {
		expect(workflowBootstrapFixture).toMatchObject({
			identity: workflowRouteDataIdentityFixture,
			rootConfig: workflowRootConfigFixture,
			configs: [workflowPageConfigFixture],
			navigationManifest: workflowNavigationManifestFixture,
			changedContentPaths: ['src/content/posts/hello-world.md']
		});
		expect(workflowCollectionNavigationFixture).toMatchObject({
			slug: 'posts',
			readiness: 'ready'
		});
		expect(workflowPageViewFixture).toMatchObject({
			slug: 'posts',
			collectionNavigation: workflowCollectionNavigationFixture.navigation,
			readiness: 'ready'
		});
		expect(workflowItemViewFixture).toMatchObject({
			slug: 'posts',
			itemId: 'hello-world',
			item: {
				title: 'Hello world'
			},
			readiness: 'ready'
		});
		expect(workflowConfigStatesFixture).toMatchObject({
			statesBySlug: {
				posts: {
					label: 'Published'
				}
			},
			readiness: 'ready'
		});
		expect(workflowBlockSupportFixture).toMatchObject({
			blockConfigs: [
				{
					id: 'callout'
				}
			],
			error: null
		});
		expect(workflowFreshnessFixture).toMatchObject({
			status: 'changed',
			changedContentPaths: ['src/content/posts/hello-world.md']
		});
		expect(workflowCacheMissFixture).toEqual({
			target: 'item-view',
			slug: 'posts',
			itemId: 'missing-item',
			readiness: 'missing',
			reason: 'item document is not available in prepared route data',
			recovery: 'fetch-route-data'
		});
	});

	it('keeps GitHub, local file handle, and fallback mechanics out of shared fixture obligations', () => {
		const keys = collectObjectKeys({
			workflowBootstrapFixture,
			workflowCollectionNavigationFixture,
			workflowPageViewFixture,
			workflowItemViewFixture,
			workflowConfigStatesFixture,
			workflowBlockSupportFixture,
			workflowFreshnessFixture,
			workflowCacheMissFixture
		});

		expect([...keys].filter((key) => TRANSPORT_MECHANIC_KEYS.includes(key))).toEqual([]);
	});

	it('adapts legacy bootstrap and freshness payloads into the new vocabulary', () => {
		const bootstrap = createWorkflowWorkspaceBootstrapData({
			configs: [workflowPageConfigFixture],
			blockConfigs: [],
			rootConfig: null,
			navigationManifest: workflowNavigationManifestFixture,
			singletonContentIdentities: {
				about: {
					path: 'src/content/about.md',
					blobSha: 'sha-about'
				}
			},
			activeDraftBranch: 'tentman-preview',
			repositoryIdentity: workflowRepositoryIdentityFixture,
			mainRepositoryIdentity: null,
			draftRepositoryIdentity: workflowRepositoryIdentityFixture,
			changedPaths: ['src/content/about.md']
		});
		const freshness = createWorkflowFreshnessData({
			activeDraftBranch: null,
			repositoryIdentity: workflowRepositoryIdentityFixture,
			mainRepositoryIdentity: workflowRepositoryIdentityFixture,
			draftRepositoryIdentity: null,
			unchanged: true,
			freshnessStatus: 'unchanged',
			changedPaths: null
		});

		expect(bootstrap).toMatchObject({
			identity: {
				hasEditableDraft: true
			},
			changedContentPaths: ['src/content/about.md']
		});
		expect(freshness).toMatchObject({
			status: 'unchanged',
			unchanged: true,
			changedContentPaths: []
		});
	});

	it('normalizes page, block-support, and cache-miss outcomes', () => {
		expect(createWorkflowBlockSupportData({})).toEqual({
			blockConfigs: [],
			packageBlocks: [],
			error: null
		});
		expect(
			createWorkflowPageViewData({
				slug: 'missing',
				content: null,
				collectionNavigation: null,
				contentError: null,
				cacheMiss: createWorkflowCacheMissResult({
					target: 'page-view',
					slug: 'missing',
					reason: 'page view is not prepared'
				})
			})
		).toMatchObject({
			slug: 'missing',
			readiness: 'missing',
			cacheMiss: {
				target: 'page-view',
				recovery: 'fetch-route-data'
			}
		});
	});
});
