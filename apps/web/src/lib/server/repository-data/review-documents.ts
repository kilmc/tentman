import type { ParsedContentConfig } from '$lib/config/parse';
import { parseCollectionItem } from '$lib/features/content-management/transforms';
import type { ContentRecord } from '$lib/features/content-management/types';
import { normalizeRuntimeCollectionItemIds } from '$lib/features/content-management/stable-identity';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	getChangedFilePaths,
	getDirectoryContentTarget,
	getDirectoryItemIdFromPath,
	isRelevantDirectoryContentChange,
	type ChangedPathFile,
	type DirectoryBackedParsedContentConfig
} from './path-classification';

type DirectoryChangeStatus = 'added' | 'modified' | 'changed' | 'removed';

interface ChangedDirectoryReviewDocumentsInput {
	baseBackend: RepositoryBackend;
	draftBackend: RepositoryBackend;
	config: ParsedContentConfig;
	configPath: string;
	files: ChangedPathFile[];
	baseBranch: string;
	draftBranch: string;
}

export interface ChangedDirectoryReviewDocuments {
	beforeContent: ContentRecord[];
	afterContent: ContentRecord[];
}

function isDirectoryBackedCollection(
	config: ParsedContentConfig
): config is DirectoryBackedParsedContentConfig {
	return Boolean(config.collection) && config.content.mode === 'directory';
}

function getChangedFilename(file: ChangedPathFile): string | null {
	const path = file.filename;
	return path.split('/').pop() ?? null;
}

function isSimpleDirectoryChange(status: string): status is DirectoryChangeStatus {
	return status === 'added' || status === 'modified' || status === 'changed' || status === 'removed';
}

function getDirectoryChangePath(file: ChangedPathFile): string | null {
	const paths = getChangedFilePaths(file);
	return paths.length === 1 ? paths[0] ?? null : null;
}

async function readDirectoryItem(input: {
	backend: RepositoryBackend;
	path: string;
	ref: string;
	filename: string;
	isMarkdown: boolean;
}): Promise<ContentRecord> {
	return parseCollectionItem(
		await input.backend.readTextFile(input.path, { ref: input.ref }),
		input.isMarkdown,
		input.filename
	);
}

export async function getChangedDirectoryReviewDocuments(
	input: ChangedDirectoryReviewDocumentsInput
): Promise<ChangedDirectoryReviewDocuments | null> {
	if (!isDirectoryBackedCollection(input.config)) {
		return null;
	}

	const target = getDirectoryContentTarget(input.config, input.configPath);
	const relevantFiles = input.files.filter((file) => isRelevantDirectoryContentChange(file, target));
	if (relevantFiles.length === 0) {
		return {
			beforeContent: [],
			afterContent: []
		};
	}

	const isMarkdown =
		target.templateExtension === '.md' || target.templateExtension === '.markdown';
	const beforeReads: Array<Promise<ContentRecord>> = [];
	const afterReads: Array<Promise<ContentRecord>> = [];

	for (const file of relevantFiles) {
		if (!isSimpleDirectoryChange(file.status)) {
			return null;
		}

		const path = getDirectoryChangePath(file);
		if (!path) {
			return null;
		}

		const itemId = getDirectoryItemIdFromPath(path);
		const filename = getChangedFilename(file);
		if (!itemId || !filename) {
			return null;
		}

		if (file.status === 'modified' || file.status === 'changed' || file.status === 'removed') {
			beforeReads.push(
				readDirectoryItem({
					backend: input.baseBackend,
					path,
					ref: input.baseBranch,
					filename,
					isMarkdown
				})
			);
		}

		if (file.status === 'modified' || file.status === 'changed' || file.status === 'added') {
			afterReads.push(
				readDirectoryItem({
					backend: input.draftBackend,
					path,
					ref: input.draftBranch,
					filename,
					isMarkdown
				})
			);
		}
	}

	try {
		const [beforeContent, afterContent] = await Promise.all([
			Promise.all(beforeReads),
			Promise.all(afterReads)
		]);

		return {
			beforeContent: normalizeRuntimeCollectionItemIds(input.config, beforeContent),
			afterContent: normalizeRuntimeCollectionItemIds(input.config, afterContent)
		};
	} catch (error) {
		console.error('Failed to load changed directory review documents:', error);
		return null;
	}
}
