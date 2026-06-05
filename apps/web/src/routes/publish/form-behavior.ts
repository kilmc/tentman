interface DraftBranchStoreLike {
	clear(): void;
}

type EnhanceUpdateContext = {
	update(): Promise<void>;
};

type EnhanceCancelContext = {
	cancel(): void;
};

interface DraftCacheCleanupOptions {
	clearDraftCache?: () => Promise<void> | void;
}

export function createPublishEnhanceHandler(
	draftBranchStore: DraftBranchStoreLike,
	setPublishing: (value: boolean) => void,
	options: DraftCacheCleanupOptions = {}
) {
	return () => {
		setPublishing(true);

		return async ({ update }: EnhanceUpdateContext) => {
			await update();
			await options.clearDraftCache?.();
			draftBranchStore.clear();
			setPublishing(false);
		};
	};
}

export function createDiscardEnhanceHandler(
	draftBranchStore: DraftBranchStoreLike,
	setDiscarding: (value: boolean) => void,
	confirmDiscard: () => boolean,
	options: DraftCacheCleanupOptions = {}
) {
	return ({ cancel }: EnhanceCancelContext) => {
		if (!confirmDiscard()) {
			cancel();
			return;
		}

		setDiscarding(true);

		return async ({ update }: EnhanceUpdateContext) => {
			await update();
			await options.clearDraftCache?.();
			draftBranchStore.clear();
			setDiscarding(false);
		};
	};
}
