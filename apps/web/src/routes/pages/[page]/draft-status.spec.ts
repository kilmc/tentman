import { describe, expect, it, vi } from 'vitest';
import { syncDraftBranchStoreForRepo } from './draft-status';

describe('routes/pages/[page]/draft-status', () => {
	it('stores the managed draft branch for the selected repository when draft status is present', () => {
		const draftBranchStore = {
			setBranch: vi.fn(),
			hasDraft: vi.fn(() => false),
			clear: vi.fn()
		};

		syncDraftBranchStoreForRepo(
			{
				owner: 'acme',
				name: 'docs'
			},
			'tentman-preview',
			draftBranchStore
		);

		expect(draftBranchStore.setBranch).toHaveBeenCalledWith('tentman-preview', 'acme/docs');
		expect(draftBranchStore.clear).not.toHaveBeenCalled();
	});

	it('clears stale draft state when the selected repository no longer has a draft branch', () => {
		const draftBranchStore = {
			setBranch: vi.fn(),
			hasDraft: vi.fn(() => true),
			clear: vi.fn()
		};

		syncDraftBranchStoreForRepo(
			{
				owner: 'acme',
				name: 'docs'
			},
			null,
			draftBranchStore
		);

		expect(draftBranchStore.hasDraft).toHaveBeenCalledWith('acme/docs');
		expect(draftBranchStore.clear).toHaveBeenCalled();
		expect(draftBranchStore.setBranch).not.toHaveBeenCalled();
	});

	it('does nothing when there is no selected repository context', () => {
		const draftBranchStore = {
			setBranch: vi.fn(),
			hasDraft: vi.fn(() => true),
			clear: vi.fn()
		};

		syncDraftBranchStoreForRepo(null, 'tentman-preview', draftBranchStore);

		expect(draftBranchStore.setBranch).not.toHaveBeenCalled();
		expect(draftBranchStore.hasDraft).not.toHaveBeenCalled();
		expect(draftBranchStore.clear).not.toHaveBeenCalled();
	});
});
