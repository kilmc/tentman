import { draftAssetStore } from '$lib/features/draft-assets/store';
import {
	collectDraftAssetRefsFromString,
	getDraftAssetRepoKey
} from '$lib/features/draft-assets/shared';
import { getDraftImageValidationError } from '$lib/features/draft-assets/validation';
import type { DraftAssetStore } from '$lib/features/draft-assets/types';

export function getMarkdownFieldRemovedDraftAssetRefs(
	previousMarkdown: string,
	nextMarkdown: string
): string[] {
	const previousRefs = new Set(collectDraftAssetRefsFromString(previousMarkdown));
	const nextRefs = new Set(collectDraftAssetRefsFromString(nextMarkdown));

	return Array.from(previousRefs).filter((ref) => !nextRefs.has(ref));
}

export function queueMarkdownFieldDraftCleanup(options: {
	previousMarkdown: string;
	nextMarkdown: string;
	getCurrentMarkdown: () => string;
	isDestroyed: () => boolean;
	draftAssets?: DraftAssetStore;
}) {
	const removedRefs = getMarkdownFieldRemovedDraftAssetRefs(
		options.previousMarkdown,
		options.nextMarkdown
	);

	if (removedRefs.length === 0) {
		return;
	}

	queueMicrotask(() => {
		if (options.isDestroyed()) {
			return;
		}

		const activeRefs = new Set(collectDraftAssetRefsFromString(options.getCurrentMarkdown()));
		const refsToDelete = removedRefs.filter((ref) => !activeRefs.has(ref));
		if (refsToDelete.length === 0) {
			return;
		}

		const activeDraftAssetStore = options.draftAssets ?? draftAssetStore;
		void Promise.all(refsToDelete.map((ref) => activeDraftAssetStore.delete(ref)));
	});
}

export async function stageMarkdownFieldImage(options: {
	file: File;
	repoKey: string | null | undefined;
	storagePath: string;
	draftAssets?: DraftAssetStore;
}): Promise<{ ref: string }> {
	const validationError = getDraftImageValidationError(options.file);
	if (validationError) {
		throw new Error(validationError);
	}

	if (!options.repoKey) {
		throw new Error('Unable to determine the current repository for draft asset storage.');
	}

	const activeDraftAssetStore = options.draftAssets ?? draftAssetStore;
	const result = await activeDraftAssetStore.create(options.file, {
		repoKey: options.repoKey,
		storagePath: options.storagePath
	});

	return {
		ref: result.ref
	};
}
