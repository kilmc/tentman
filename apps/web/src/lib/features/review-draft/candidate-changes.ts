import type { DiscoveredConfig } from '$lib/config/discovery';
import { NAVIGATION_MANIFEST_PATH } from '$lib/features/content-management/navigation-manifest';
import type { BranchChangedFile } from '$lib/github/branch';
import { resolveConfigPath } from '$lib/utils/validation';

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

interface ConfigTarget {
	slug: string;
	configPath: string;
	contentPath: string;
	contentMode: 'file' | 'directory';
	templatePath?: string;
}

function toChangedFileStatus(
	status: string | undefined
): ReviewDraftChangedFile['status'] {
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

function buildConfigTargets(configs: DiscoveredConfig[]): ConfigTarget[] {
	return configs.map((config) => ({
		slug: config.slug,
		configPath: config.path,
		contentPath: resolveConfigPath(config.path, config.config.content.path),
		contentMode: config.config.content.mode,
		...(config.config.content.mode === 'directory'
			? {
					templatePath: resolveConfigPath(config.path, config.config.content.template)
				}
			: {})
	}));
}

function mapFileToConfigSlug(
	targets: ConfigTarget[],
	filename: string
): string | null {
	for (const target of targets) {
		if (filename === target.configPath || filename === target.contentPath) {
			return target.slug;
		}

		if (target.contentMode === 'directory' && filename.startsWith(`${target.contentPath}/`)) {
			return target.slug;
		}

		if (target.templatePath && filename === target.templatePath) {
			return target.slug;
		}
	}

	return null;
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
	const targets = buildConfigTargets(configs);
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

		const candidatePaths = [changedFile.filename, changedFile.previousFilename].filter(
			(path): path is string => typeof path === 'string' && path.length > 0
		);
		const matchingSlug = candidatePaths
			.map((path) => mapFileToConfigSlug(targets, path))
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
