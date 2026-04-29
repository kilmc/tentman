import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const draftAssetClientMocks = vi.hoisted(() => ({
	appendDraftAssetsToFormData: vi.fn(),
	getDraftAssetPreviewChanges: vi.fn()
}));

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		}
	};
}

const draftBranchState = vi.hoisted(() => createStoreState({ branchName: null }));
const draftBranchMocks = vi.hoisted(() => ({
	setBranch: vi.fn()
}));

vi.mock('$app/forms', () => ({
	enhance: () => ({
		destroy() {}
	})
}));

vi.mock('$lib/features/draft-assets/client', () => ({
	appendDraftAssetsToFormData: draftAssetClientMocks.appendDraftAssetsToFormData,
	getDraftAssetPreviewChanges: draftAssetClientMocks.getDraftAssetPreviewChanges
}));

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		delete: vi.fn(async () => {})
	}
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: {
		subscribe: draftBranchState.subscribe,
		setBranch: draftBranchMocks.setBranch
	}
}));

import PreviewChangesPage from '../../../routes/pages/[page]/preview-changes/+page.svelte';

describe('routes/pages/[page]/preview-changes/+page.svelte', () => {
	beforeEach(() => {
		draftAssetClientMocks.appendDraftAssetsToFormData.mockReset();
		draftAssetClientMocks.getDraftAssetPreviewChanges.mockReset();
		draftBranchMocks.setBranch.mockReset();
		draftBranchState.set({ branchName: null });
	});

	it('includes pending staged asset creates in the displayed preview file count', async () => {
		draftAssetClientMocks.getDraftAssetPreviewChanges.mockResolvedValue([
			{
				path: 'static/images/hero-asset.png',
				type: 'create',
				size: 2048
			}
		]);

		const screen = render(PreviewChangesPage, {
			data: {
				discoveredConfig: {
					slug: 'about',
					config: {
						label: 'About'
					}
				},
				contentData: {
					title: 'About',
					body: '![Hero](draft-asset:hero)'
				},
				changesSummary: {
					totalChanges: 1,
					files: [
						{
							path: 'content/about.md',
							type: 'update'
						}
					]
				},
				changesError: null,
				repo: {
					owner: 'acme',
					name: 'docs'
				},
				branch: null
			},
			form: undefined as never
		});

		await expect
			.element(screen.getByRole('heading', { name: '2 files will be changed' }))
			.toBeVisible();
		await expect.element(screen.getByText('static/images/hero-asset.png')).toBeVisible();
		await expect.element(screen.getByText('Size: 2.00 KB')).toBeVisible();
	});
});
