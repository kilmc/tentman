interface DraftBranchStoreLike {
	clear(): void;
}

type EnhanceUpdateContext = {
	update(): Promise<void>;
};

type EnhanceCancelContext = {
	cancel(): void;
};

export function createPublishEnhanceHandler(
	draftBranchStore: DraftBranchStoreLike,
	setPublishing: (value: boolean) => void
) {
	return () => {
		setPublishing(true);

		return async ({ update }: EnhanceUpdateContext) => {
			await update();
			draftBranchStore.clear();
			setPublishing(false);
		};
	};
}

export function createDiscardEnhanceHandler(
	draftBranchStore: DraftBranchStoreLike,
	setDiscarding: (value: boolean) => void,
	confirmDiscard: () => boolean
) {
	return ({ cancel }: EnhanceCancelContext) => {
		if (!confirmDiscard()) {
			cancel();
			return;
		}

		setDiscarding(true);

		return async ({ update }: EnhanceUpdateContext) => {
			await update();
			draftBranchStore.clear();
			setDiscarding(false);
		};
	};
}
