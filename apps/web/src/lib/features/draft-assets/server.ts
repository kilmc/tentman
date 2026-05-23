import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';
import type { DraftAssetMaterializationResult } from './types';
import {
	buildDraftAssetPaths,
	buildDraftAssetFileChanges,
	buildDraftAssetRef,
	collectAllowedDraftAssetStoragePaths,
	collectDraftAssetRefsFromContent,
	getDraftAssetFileFieldName,
	parseDraftAssetManifest,
	replaceDraftAssetRefsInContent,
	DRAFT_ASSET_MANIFEST_FIELD
} from './shared';

export async function materializeDraftAssetsFromFormData(input: {
	formData: FormData;
	content: ContentRecord;
	configPath: string;
	blocks: BlockUsage[];
	backend: RepositoryBackend;
	defaultStoragePath?: string;
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
	const allowedPathsByRef = collectAllowedDraftAssetStoragePaths({
		content: input.content,
		blocks: input.blocks,
		configPath: input.configPath,
		defaultStoragePath: input.defaultStoragePath
	});
	const replacements = new Map<string, string>();
	const usedEntries = [];

	for (const ref of refs) {
		const allowedStoragePaths = allowedPathsByRef.get(ref);
		if (!allowedStoragePaths || allowedStoragePaths.size === 0) {
			throw new Error(`Draft asset ref is not allowed by the current content config: ${ref}`);
		}

		const entry = manifestByRef.get(ref);
		if (!entry) {
			throw new Error(`Draft asset manifest entry is missing for ${ref}`);
		}
		if (entry.ref !== buildDraftAssetRef(entry.id)) {
			throw new Error(`Draft asset manifest entry is invalid for ${ref}`);
		}
		if (!allowedStoragePaths.has(entry.storagePath)) {
			throw new Error(`Draft asset storage path is not allowed for ${ref}`);
		}

		const filePart = input.formData.get(getDraftAssetFileFieldName(entry.id));
		if (!(filePart instanceof File)) {
			throw new Error(`Draft asset file is missing for ${ref}`);
		}

		const assetPaths = buildDraftAssetPaths({
			id: entry.id,
			storagePath: entry.storagePath,
			originalName: filePart.name,
			mimeType: filePart.type
		});
		const bytes = new Uint8Array(await filePart.arrayBuffer());
		await input.backend.writeBinaryFile(assetPaths.targetPath, bytes, input.writeOptions);
		replacements.set(ref, assetPaths.publicPath);
		usedEntries.push({
			id: entry.id,
			ref,
			storagePath: assetPaths.storagePath,
			originalName: filePart.name,
			mimeType: filePart.type,
			size: filePart.size,
			targetFilename: assetPaths.targetFilename,
			targetPath: assetPaths.targetPath,
			publicPath: assetPaths.publicPath
		});
	}

	return {
		content: replaceDraftAssetRefsInContent(input.content, replacements),
		fileChanges: buildDraftAssetFileChanges(usedEntries),
		cleanedRefs: refs
	};
}
