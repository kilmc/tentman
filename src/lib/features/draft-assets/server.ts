import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';
import type { DraftAssetMaterializationResult } from './types';
import {
	buildDraftAssetFileChanges,
	collectDraftAssetRefsFromContent,
	getDraftAssetFileFieldName,
	parseDraftAssetManifest,
	replaceDraftAssetRefsInContent,
	DRAFT_ASSET_MANIFEST_FIELD
} from './shared';

export async function materializeDraftAssetsFromFormData(input: {
	formData: FormData;
	content: ContentRecord;
	backend: RepositoryBackend;
	writeOptions?: RepositoryWriteOptions;
}): Promise<DraftAssetMaterializationResult> {
	const refs = collectDraftAssetRefsFromContent(input.content);
	if (refs.length === 0) {
		return {
			content: input.content,
			fileChanges: [],
			cleanedRefs: []
		};
	}

	const manifest = parseDraftAssetManifest(input.formData.get(DRAFT_ASSET_MANIFEST_FIELD));
	const manifestByRef = new Map(manifest.map((entry) => [entry.ref, entry]));
	const replacements = new Map<string, string>();
	const usedEntries = [];

	for (const ref of refs) {
		const entry = manifestByRef.get(ref);
		if (!entry) {
			throw new Error(`Draft asset manifest entry is missing for ${ref}`);
		}

		const filePart = input.formData.get(getDraftAssetFileFieldName(entry.id));
		if (!(filePart instanceof File)) {
			throw new Error(`Draft asset file is missing for ${ref}`);
		}

		const bytes = new Uint8Array(await filePart.arrayBuffer());
		await input.backend.writeBinaryFile(entry.targetPath, bytes, input.writeOptions);
		replacements.set(ref, entry.publicPath);
		usedEntries.push(entry);
	}

	return {
		content: replaceDraftAssetRefsInContent(input.content, replacements),
		fileChanges: buildDraftAssetFileChanges(usedEntries),
		cleanedRefs: refs
	};
}
