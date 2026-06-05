import { describe, expect, it, vi } from 'vitest';
import { createDiscardEnhanceHandler, createPublishEnhanceHandler } from './form-behavior';

describe('routes/publish/form-behavior', () => {
	it('clears the draft branch store after a successful publish submission update', async () => {
		const draftBranchStore = {
			clear: vi.fn()
		};
		const setPublishing = vi.fn();
		const clearDraftCache = vi.fn(async () => {});
		const update = vi.fn(async () => {});

		const runEnhance = createPublishEnhanceHandler(draftBranchStore, setPublishing, {
			clearDraftCache
		});
		const onSubmitResult = runEnhance();

		expect(setPublishing).toHaveBeenCalledWith(true);

		await onSubmitResult({ update });

		expect(update).toHaveBeenCalled();
		expect(clearDraftCache).toHaveBeenCalled();
		expect(draftBranchStore.clear).toHaveBeenCalled();
		expect(setPublishing).toHaveBeenLastCalledWith(false);
	});

	it('cancels discard submissions when the user declines confirmation', () => {
		const draftBranchStore = {
			clear: vi.fn()
		};
		const setDiscarding = vi.fn();
		const confirmDiscard = vi.fn(() => false);
		const cancel = vi.fn();

		const result = createDiscardEnhanceHandler(
			draftBranchStore,
			setDiscarding,
			confirmDiscard
		)({ cancel });

		expect(confirmDiscard).toHaveBeenCalled();
		expect(cancel).toHaveBeenCalled();
		expect(setDiscarding).not.toHaveBeenCalled();
		expect(draftBranchStore.clear).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});

	it('clears the draft branch store after a confirmed discard submission update', async () => {
		const draftBranchStore = {
			clear: vi.fn()
		};
		const setDiscarding = vi.fn();
		const clearDraftCache = vi.fn(async () => {});
		const confirmDiscard = vi.fn(() => true);
		const cancel = vi.fn();
		const update = vi.fn(async () => {});

		const onSubmitResult = createDiscardEnhanceHandler(
			draftBranchStore,
			setDiscarding,
			confirmDiscard,
			{ clearDraftCache }
		)({ cancel });

		expect(setDiscarding).toHaveBeenCalledWith(true);
		expect(cancel).not.toHaveBeenCalled();

		await onSubmitResult?.({ update });

		expect(update).toHaveBeenCalled();
		expect(clearDraftCache).toHaveBeenCalled();
		expect(draftBranchStore.clear).toHaveBeenCalled();
		expect(setDiscarding).toHaveBeenLastCalledWith(false);
	});
});
