import { describe, expect, it } from 'vitest';
import { createWorkflowMutationResult } from './workflow-mutations';

describe('workflow mutation contract', () => {
	it('normalizes content save outcomes with redirect, cleanup, changed paths, and refresh instructions', () => {
		const result = createWorkflowMutationResult({
			mode: 'local',
			intent: {
				type: 'save-content',
				slug: 'posts',
				target: 'collection-item',
				itemId: 'hello-world'
			},
			message: 'Changes saved.',
			changedPaths: ['src/content/posts/hello-world.md'],
			redirect: {
				href: '/pages/posts/hello-world/edit?published=true'
			},
			recoveryCleanup: {
				clearEditorRecovery: true,
				draftAssetRefs: ['draft-asset:hero']
			},
			refresh: {
				workspace: true,
				cachePaths: ['src/content/posts/hello-world.md']
			}
		});

		expect(result).toEqual({
			mode: 'local',
			intent: {
				type: 'save-content',
				slug: 'posts',
				target: 'collection-item',
				itemId: 'hello-world'
			},
			outcome: 'success',
			message: 'Changes saved.',
			changedPaths: ['src/content/posts/hello-world.md'],
			redirect: {
				href: '/pages/posts/hello-world/edit?published=true',
				status: 303,
				replace: false
			},
			recoveryCleanup: {
				clearEditorRecovery: true,
				draftAssetRefs: ['draft-asset:hero']
			},
			refresh: {
				workspace: true,
				remountWorkspace: false,
				navigationManifest: false,
				configStates: false,
				collections: [],
				cachePaths: ['src/content/posts/hello-world.md']
			},
			error: null,
			degradedReason: null
		});
	});

	it('represents degraded publish outcomes without leaking branch mechanics', () => {
		const result = createWorkflowMutationResult({
			mode: 'github',
			intent: {
				type: 'publish-draft'
			},
			outcome: 'degraded',
			degradedReason: 'Could not scope changed paths before publishing.',
			redirect: {
				href: '/pages?merged=true'
			},
			refresh: {
				workspace: true
			}
		});

		expect(result).toMatchObject({
			mode: 'github',
			intent: {
				type: 'publish-draft'
			},
			outcome: 'degraded',
			changedPaths: [],
			degradedReason: 'Could not scope changed paths before publishing.',
			refresh: {
				workspace: true
			}
		});
		expect(JSON.stringify(result)).not.toContain('branchName');
	});

	it('represents mutation errors through the same result shape', () => {
		const result = createWorkflowMutationResult({
			mode: 'github',
			intent: {
				type: 'delete-item',
				slug: 'posts',
				itemId: 'hello-world'
			},
			outcome: 'error',
			error: 'Content item could not be deleted.'
		});

		expect(result).toMatchObject({
			outcome: 'error',
			error: 'Content item could not be deleted.',
			redirect: null,
			recoveryCleanup: {
				clearEditorRecovery: false,
				draftAssetRefs: []
			}
		});
	});
});
