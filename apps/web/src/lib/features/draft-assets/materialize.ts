import type { ContentRecord } from '$lib/features/content-management/types';
import type { DraftAssetMaterializationOptions, DraftAssetMaterializationResult } from './types';
import { draftAssetStore } from './store';
import {
	buildDraftAssetFileChanges,
	collectDraftAssetRefsFromContent,
	replaceDraftAssetRefsInContent,
	toDraftAssetSubmissionEntry
} from './shared';

export async function materializeDraftAssets(
	options: DraftAssetMaterializationOptions
): Promise<DraftAssetMaterializationResult> {
	const store = options.store ?? draftAssetStore;
	const refs = collectDraftAssetRefsFromContent(options.content);
	if (refs.length === 0) {
		return {
			content: options.content,
			fileChanges: [],
			cleanedRefs: []
		};
	}

	const replacements = new Map<string, string>();
	const entries = [];

	for (const ref of refs) {
		const metadata = await store.getMetadata(ref);
		if (!metadata) {
			throw new Error(`Draft asset metadata is missing for ${ref}`);
		}

		const file = await store.readFile(ref);
		const bytes = new Uint8Array(await file.arrayBuffer());
		await options.backend.writeBinaryFile(metadata.targetPath, bytes, options.writeOptions);
		replacements.set(ref, metadata.publicPath);
		entries.push(toDraftAssetSubmissionEntry(metadata));
	}

	return {
		content: replaceDraftAssetRefsInContent(options.content, replacements),
		fileChanges: buildDraftAssetFileChanges(entries),
		cleanedRefs: refs
	};
}
