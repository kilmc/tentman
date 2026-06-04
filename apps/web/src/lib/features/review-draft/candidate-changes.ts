import type { DiscoveredConfig } from '$lib/config/discovery';
import { NAVIGATION_MANIFEST_PATH } from '$lib/features/content-management/navigation-manifest';
import type { BranchChangedFile } from '$lib/github/branch';
import {
	buildContentFileTargets,
	getChangedFilePaths,
	mapPathToConfigSlug
} from '$lib/server/repository-data/path-classification';

export interface ReviewDraftChangedFile {
	filename: string;
	status: 'added' | 'modified' | 'removed' | 'renamed' | 'unknown';
	previousFilename?: string;
}

export interface ReviewDraftCandidateChanges {
	files: ReviewDraftChangedFile[];
	configFilesBySlug: Map<string, ReviewDraftChangedFile[]>;
	manifestChanged: boolean;
	rootConfigChanged: boolean;
	otherTentmanFiles: ReviewDraftChangedFile[];
	hiddenFiles: ReviewDraftChangedFile[];
}

function toChangedFileStatus(status: string | undefined): ReviewDraftChangedFile['status'] {
	switch (status) {
		case 'added':
		case 'modified':
		case 'removed':
		case 'renamed':
			return status;
		default:
			return 'unknown';
	}
}

function isTentmanRelatedFile(filename: string): boolean {
	return (
		filename === 'tentman.json' ||
		filename === NAVIGATION_MANIFEST_PATH ||
		filename.endsWith('.tentman.json') ||
		filename.startsWith('tentman/')
	);
}

export function toReviewDraftChangedFiles(files: BranchChangedFile[]): ReviewDraftChangedFile[] {
	return files.map((file) => ({
		filename: file.filename,
		status: toChangedFileStatus(file.status),
		...(file.previous_filename ? { previousFilename: file.previous_filename } : {})
	}));
}

export function classifyReviewDraftChangedFiles(
	configs: DiscoveredConfig[],
	changedFiles: ReviewDraftChangedFile[]
): ReviewDraftCandidateChanges {
	const targets = buildContentFileTargets(configs);
	const configFilesBySlug = new Map<string, ReviewDraftChangedFile[]>();
	const otherTentmanFiles: ReviewDraftChangedFile[] = [];
	const hiddenFiles: ReviewDraftChangedFile[] = [];
	let manifestChanged = false;
	let rootConfigChanged = false;

	for (const changedFile of changedFiles) {
		if (changedFile.filename === NAVIGATION_MANIFEST_PATH) {
			manifestChanged = true;
			continue;
		}

		if (changedFile.filename === 'tentman.json') {
			rootConfigChanged = true;
			continue;
		}

		const candidatePaths = getChangedFilePaths(changedFile);
		const matchingSlug = candidatePaths
			.map((path) => mapPathToConfigSlug(targets, path))
			.find((slug): slug is string => Boolean(slug));

		if (matchingSlug) {
			const existing = configFilesBySlug.get(matchingSlug) ?? [];
			existing.push(changedFile);
			configFilesBySlug.set(matchingSlug, existing);
			continue;
		}

		if (isTentmanRelatedFile(changedFile.filename)) {
			otherTentmanFiles.push(changedFile);
			continue;
		}

		hiddenFiles.push(changedFile);
	}

	return {
		files: changedFiles,
		configFilesBySlug,
		manifestChanged,
		rootConfigChanged,
		otherTentmanFiles,
		hiddenFiles
	};
}
