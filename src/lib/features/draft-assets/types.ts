import type { FileChange } from '$lib/content/adapters/types';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';

export const DRAFT_ASSET_REF_PREFIX = 'draft-asset:';
export const DRAFT_ASSET_MANIFEST_FIELD = 'draftAssetManifest';
export const DRAFT_ASSET_FILE_FIELD_PREFIX = 'draftAssetFile:';
export const DRAFT_ASSET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DraftAssetMetadata {
	id: string;
	ref: string;
	repoKey: string;
	storagePath: string;
	originalName: string;
	mimeType: string;
	size: number;
	createdAt: string;
	targetFilename: string;
	targetPath: string;
	publicPath: string;
	byteStore: 'opfs' | 'idb';
	byteKey: string;
}

export interface DraftAssetSubmissionEntry {
	id: string;
	ref: string;
	originalName: string;
	mimeType: string;
	size: number;
	targetFilename: string;
	targetPath: string;
	publicPath: string;
}

export interface DraftAssetCreateOptions {
	repoKey: string;
	storagePath?: string;
}

export interface DraftAssetStore {
	create(
		file: File,
		options: DraftAssetCreateOptions
	): Promise<{
		ref: string;
		previewUrl: string | null;
		metadata: DraftAssetMetadata;
	}>;
	readFile(ref: string): Promise<File>;
	resolveUrl(ref: string): Promise<string | null>;
	delete(ref: string): Promise<void>;
	getMetadata(ref: string): Promise<DraftAssetMetadata | null>;
	getMetadataForContent(content: ContentRecord): Promise<DraftAssetMetadata[]>;
	collectFromContent(content: ContentRecord): string[];
	gc(): Promise<void>;
}

export interface DraftAssetMaterializationResult {
	content: ContentRecord;
	fileChanges: FileChange[];
	cleanedRefs: string[];
}

export interface DraftAssetMaterializationOptions {
	backend: RepositoryBackend;
	content: ContentRecord;
	writeOptions?: RepositoryWriteOptions;
	store?: DraftAssetStore;
}
