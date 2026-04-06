import type { ContentRecord } from '$lib/features/content-management/types';
import type { DraftAssetStore, DraftAssetSubmissionEntry } from './types';
import { draftAssetStore } from './store';
import {
	buildDraftAssetFileChanges,
	collectDraftAssetRefsFromContent,
	getDraftAssetFileFieldName,
	parseDraftAssetManifest,
	toDraftAssetSubmissionEntry,
	DRAFT_ASSET_MANIFEST_FIELD
} from './shared';

async function getDraftAssetSubmissionAssets(
	content: ContentRecord,
	store: DraftAssetStore
): Promise<Array<{ entry: DraftAssetSubmissionEntry; file: File }>> {
	const refs = collectDraftAssetRefsFromContent(content);
	const assets = await Promise.all(
		refs.map(async (ref) => {
			const metadata = await store.getMetadata(ref);
			if (!metadata) {
				throw new Error(`Draft asset metadata is missing for ${ref}`);
			}

			const file = await store.readFile(ref);

			return {
				entry: toDraftAssetSubmissionEntry(metadata),
				file
			};
		})
	);

	return assets;
}

export async function appendDraftAssetsToFormData(
	formData: FormData,
	content: ContentRecord,
	store: DraftAssetStore = draftAssetStore
): Promise<{ entries: DraftAssetSubmissionEntry[]; refs: string[] }> {
	const previousManifest = parseDraftAssetManifest(formData.get(DRAFT_ASSET_MANIFEST_FIELD));
	const assets = await getDraftAssetSubmissionAssets(content, store);
	const entries = assets.map((asset) => asset.entry);

	for (const asset of previousManifest) {
		formData.delete(getDraftAssetFileFieldName(asset.id));
	}
	formData.delete(DRAFT_ASSET_MANIFEST_FIELD);

	if (entries.length === 0) {
		return { entries, refs: [] };
	}

	formData.set(DRAFT_ASSET_MANIFEST_FIELD, JSON.stringify(entries));

	for (const asset of assets) {
		formData.set(getDraftAssetFileFieldName(asset.entry.id), asset.file, asset.entry.originalName);
	}

	return {
		entries,
		refs: entries.map((entry) => entry.ref)
	};
}

export async function getDraftAssetPreviewChanges(
	content: ContentRecord,
	store: DraftAssetStore = draftAssetStore
) {
	const assets = await getDraftAssetSubmissionAssets(content, store);
	return buildDraftAssetFileChanges(assets.map((asset) => asset.entry));
}
