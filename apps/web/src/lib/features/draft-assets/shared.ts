import type { ChangesSummary, FileChange } from '$lib/content/adapters/types';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
import type { SelectedBackend } from '$lib/repository/selection';
import {
	DRAFT_ASSET_FILE_FIELD_PREFIX,
	DRAFT_ASSET_MANIFEST_FIELD,
	DRAFT_ASSET_REF_PREFIX,
	type DraftAssetMetadata,
	type DraftAssetSubmissionEntry
} from './types';

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

function trimDotSlash(value: string): string {
	return value.replace(/^(?:\.\/)+/, '');
}

function normalizeRepoRelativePath(value: string): string {
	const segments = value.replace(/\\/g, '/').split('/');
	const normalizedSegments: string[] = [];

	for (const segment of segments) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (normalizedSegments.length > 0) {
				normalizedSegments.pop();
			}
			continue;
		}

		normalizedSegments.push(segment);
	}

	return normalizedSegments.join('/');
}

function sanitizeFilenamePart(value: string): string {
	const normalized = value
		.normalize('NFKD')
		.replace(/[^\x00-\x7F]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || 'image';
}

function getFileExtension(originalName: string, mimeType: string): string {
	const match = /\.[a-z0-9]+$/i.exec(originalName);
	if (match) {
		return match[0].toLowerCase();
	}

	switch (mimeType) {
		case 'image/jpeg':
			return '.jpg';
		case 'image/png':
			return '.png';
		case 'image/webp':
			return '.webp';
		case 'image/gif':
			return '.gif';
		case 'image/svg+xml':
			return '.svg';
		default:
			return '';
	}
}

const MARKDOWN_DRAFT_IMAGE_PATTERN =
	/!\[[^\]]*]\((?:<(draft-asset:[^>\s]+)>|(draft-asset:[^\s)]+))((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/g;
const HTML_DRAFT_IMAGE_PATTERN =
	/<img\b([^>]*?)\bsrc\s*=\s*(["'])(draft-asset:[^"']+)\2([^>]*?)>/gi;

function collectDraftAssetRefsFromMarkdownString(value: string): string[] {
	const refs: string[] = [];

	for (const match of value.matchAll(MARKDOWN_DRAFT_IMAGE_PATTERN)) {
		const ref = match[1] ?? match[2];
		if (ref) {
			refs.push(ref);
		}
	}

	for (const match of value.matchAll(HTML_DRAFT_IMAGE_PATTERN)) {
		const ref = match[3];
		if (ref) {
			refs.push(ref);
		}
	}

	return refs;
}

export function collectDraftAssetRefsFromString(value: string): string[] {
	if (isDraftAssetRef(value)) {
		return [value];
	}

	return Array.from(new Set(collectDraftAssetRefsFromMarkdownString(value)));
}

function replaceDraftAssetRefsInMarkdownString(
	value: string,
	replacements: Map<string, string>
): string {
	let nextValue = value.replace(MARKDOWN_DRAFT_IMAGE_PATTERN, (match, angleRef, plainRef) => {
		const ref = angleRef ?? plainRef;
		const replacement = replacements.get(ref);

		if (!replacement) {
			return match;
		}

		return match.replace(ref, replacement);
	});

	nextValue = nextValue.replace(
		HTML_DRAFT_IMAGE_PATTERN,
		(match, beforeSrc, quote, ref, afterSrc) => {
			const replacement = replacements.get(ref);

			if (!replacement) {
				return match;
			}

			return `<img${beforeSrc}src=${quote}${replacement}${quote}${afterSrc}>`;
		}
	);

	return nextValue;
}

export function replaceDraftAssetRefsInString(
	value: string,
	replacements: Map<string, string>
): string {
	if (isDraftAssetRef(value)) {
		return replacements.get(value) ?? value;
	}

	return replaceDraftAssetRefsInMarkdownString(value, replacements);
}

export function normalizeDraftAssetStoragePath(storagePath?: string): string {
	const normalized = normalizeRepoRelativePath(
		trimDotSlash((storagePath || 'static/images/').trim())
	);
	const withoutLeadingSlash = trimLeadingSlash(normalized);
	return withoutLeadingSlash.endsWith('/') ? withoutLeadingSlash : `${withoutLeadingSlash}/`;
}

export function buildDraftAssetRef(id: string): string {
	return `${DRAFT_ASSET_REF_PREFIX}${id}`;
}

export function isDraftAssetRef(value: string | null | undefined): value is string {
	return typeof value === 'string' && value.startsWith(DRAFT_ASSET_REF_PREFIX);
}

export function getDraftAssetId(ref: string): string {
	if (!isDraftAssetRef(ref)) {
		throw new Error(`Expected draft asset ref, received "${ref}"`);
	}

	return ref.slice(DRAFT_ASSET_REF_PREFIX.length);
}

export function getDraftAssetFileFieldName(id: string): string {
	return `${DRAFT_ASSET_FILE_FIELD_PREFIX}${id}`;
}

export function buildDraftAssetMetadata(input: {
	id: string;
	repoKey: string;
	storagePath?: string;
	originalName: string;
	mimeType: string;
	size: number;
	createdAt?: string;
	byteStore: 'opfs' | 'idb';
	byteKey: string;
}): DraftAssetMetadata {
	const normalizedStoragePath = normalizeDraftAssetStoragePath(input.storagePath);
	const extension = getFileExtension(input.originalName, input.mimeType);
	const baseName = sanitizeFilenamePart(input.originalName.replace(/\.[^/.]+$/, ''));
	const targetFilename = `${baseName}-${input.id.slice(0, 8)}${extension}`;
	const targetPath = `${normalizedStoragePath}${targetFilename}`;
	const staticIndex = normalizedStoragePath.lastIndexOf('static/');
	const publicBasePath =
		staticIndex >= 0
			? `/${trimLeadingSlash(normalizedStoragePath.slice(staticIndex + 'static'.length))}`
			: `/${trimLeadingSlash(normalizedStoragePath)}`;
	const publicPath = `${trimTrailingSlash(publicBasePath)}/${targetFilename}`;

	return {
		id: input.id,
		ref: buildDraftAssetRef(input.id),
		repoKey: input.repoKey,
		storagePath: normalizedStoragePath,
		originalName: input.originalName,
		mimeType: input.mimeType,
		size: input.size,
		createdAt: input.createdAt ?? new Date().toISOString(),
		targetFilename,
		targetPath,
		publicPath,
		byteStore: input.byteStore,
		byteKey: input.byteKey
	};
}

export function collectDraftAssetRefsFromValue(value: ContentValue | undefined): string[] {
	if (typeof value === 'string') {
		return collectDraftAssetRefsFromString(value);
	}

	if (!value || typeof value !== 'object') {
		return [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((entry) => collectDraftAssetRefsFromValue(entry));
	}

	return Object.values(value).flatMap((entry) =>
		collectDraftAssetRefsFromValue(entry as ContentValue | undefined)
	);
}

export function collectDraftAssetRefsFromContent(content: ContentRecord): string[] {
	return Array.from(new Set(collectDraftAssetRefsFromValue(content)));
}

export function replaceDraftAssetRefsInValue(
	value: ContentValue | undefined,
	replacements: Map<string, string>
): ContentValue | undefined {
	if (typeof value === 'string') {
		return replaceDraftAssetRefsInString(value, replacements);
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) =>
			replaceDraftAssetRefsInValue(entry, replacements)
		) as ContentValue[];
	}

	const nextValue: ContentRecord = {};
	for (const [key, entry] of Object.entries(value)) {
		nextValue[key] = replaceDraftAssetRefsInValue(entry as ContentValue | undefined, replacements);
	}

	return nextValue;
}

export function replaceDraftAssetRefsInContent(
	content: ContentRecord,
	replacements: Map<string, string>
): ContentRecord {
	return replaceDraftAssetRefsInValue(content, replacements) as ContentRecord;
}

export function toDraftAssetSubmissionEntry(
	metadata: DraftAssetMetadata
): DraftAssetSubmissionEntry {
	return {
		id: metadata.id,
		ref: metadata.ref,
		originalName: metadata.originalName,
		mimeType: metadata.mimeType,
		size: metadata.size,
		targetFilename: metadata.targetFilename,
		targetPath: metadata.targetPath,
		publicPath: metadata.publicPath
	};
}

export function buildDraftAssetFileChanges(assets: DraftAssetSubmissionEntry[]): FileChange[] {
	return assets.map((asset) => ({
		path: asset.targetPath,
		type: 'create',
		size: asset.size
	}));
}

export function mergeChangesSummaryWithDraftAssets(
	changesSummary: ChangesSummary | null | undefined,
	assetChanges: FileChange[]
): ChangesSummary | null {
	if (!changesSummary && assetChanges.length === 0) {
		return null;
	}

	const files = [...(changesSummary?.files ?? []), ...assetChanges];

	return {
		files,
		totalChanges: files.length
	};
}

export function parseDraftAssetManifest(
	value: FormDataEntryValue | null
): DraftAssetSubmissionEntry[] {
	if (typeof value !== 'string' || !value.trim()) {
		return [];
	}

	const parsed = JSON.parse(value);
	if (!Array.isArray(parsed)) {
		throw new Error('Draft asset manifest must be an array');
	}

	return parsed.map((entry) => {
		if (!entry || typeof entry !== 'object') {
			throw new Error('Draft asset manifest entry must be an object');
		}

		const candidate = entry as Partial<DraftAssetSubmissionEntry>;
		if (
			typeof candidate.id !== 'string' ||
			typeof candidate.ref !== 'string' ||
			typeof candidate.originalName !== 'string' ||
			typeof candidate.mimeType !== 'string' ||
			typeof candidate.size !== 'number' ||
			typeof candidate.targetFilename !== 'string' ||
			typeof candidate.targetPath !== 'string' ||
			typeof candidate.publicPath !== 'string'
		) {
			throw new Error('Draft asset manifest entry is invalid');
		}

		return candidate as DraftAssetSubmissionEntry;
	});
}

export function getDraftAssetRepoKey(input: {
	selectedBackend?: SelectedBackend | null;
	selectedRepo?: { owner: string; name: string } | null;
	repo?: { owner: string; name: string } | null;
}): string | null {
	if (input.selectedBackend?.kind === 'local') {
		return `local:${input.selectedBackend.repo.pathLabel}`;
	}

	const repo = input.selectedRepo ?? input.repo;
	return repo ? `github:${repo.owner}/${repo.name}` : null;
}

export { DRAFT_ASSET_FILE_FIELD_PREFIX, DRAFT_ASSET_MANIFEST_FIELD, DRAFT_ASSET_REF_PREFIX };
