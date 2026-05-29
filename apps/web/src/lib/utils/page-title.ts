import type { ParsedContentConfig } from '$lib/config/parse';
import {
	getConfigItemLabel,
	resolveContentItemTitle
} from '$lib/features/content-management/navigation';
import type { ContentRecord } from '$lib/features/content-management/types';

const PRODUCT_NAME = 'Tentman';
const DOCS_NAME = 'Tentman docs';

export type ContentTitleKind =
	| 'view-page'
	| 'edit-page'
	| 'preview-page'
	| 'new-item'
	| 'view-item'
	| 'edit-item'
	| 'preview-item';

function normalizeTitleSegment(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().replace(/\s+/g, ' ');
	return normalized.length > 0 ? normalized : null;
}

function joinTitleSegments(...segments: Array<string | null | undefined>): string {
	const deduped: string[] = [];

	for (const segment of segments) {
		const normalized = normalizeTitleSegment(segment);
		if (!normalized) {
			continue;
		}

		if (deduped.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
			continue;
		}

		deduped.push(normalized);
	}

	return deduped.join(' | ');
}

export function formatAppTitle(context?: string | null, siteName?: string | null): string {
	return joinTitleSegments(context, siteName, PRODUCT_NAME) || PRODUCT_NAME;
}

export function formatDocsTitle(context: string): string {
	return joinTitleSegments(context, DOCS_NAME) || DOCS_NAME;
}

export function buildContentTitleContext({
	kind,
	config,
	item
}: {
	kind: ContentTitleKind;
	config: ParsedContentConfig;
	item?: ContentRecord | null;
}): string {
	const pageLabel = normalizeTitleSegment(config.label) ?? 'Page';
	const itemLabel = getConfigItemLabel(config);

	if (kind === 'view-page') {
		return pageLabel;
	}

	if (kind === 'edit-page') {
		return `Edit ${pageLabel}`;
	}

	if (kind === 'preview-page') {
		return `Preview Changes for ${pageLabel}`;
	}

	if (kind === 'new-item') {
		return `New ${itemLabel}`;
	}

	if (!item) {
		return kind === 'view-item'
			? itemLabel
			: kind === 'edit-item'
				? `Edit ${itemLabel}`
				: `Preview Changes for ${itemLabel}`;
	}

	const titleResolution = resolveContentItemTitle(config, item);
	const itemTitle = titleResolution.usedFallback ? itemLabel : titleResolution.title;
	const includeCollectionLabel = !titleResolution.usedFallback;

	if (kind === 'view-item') {
		return includeCollectionLabel ? joinTitleSegments(itemTitle, pageLabel) : itemTitle;
	}

	if (kind === 'edit-item') {
		return includeCollectionLabel
			? joinTitleSegments(`Edit ${itemTitle}`, pageLabel)
			: `Edit ${itemTitle}`;
	}

	return includeCollectionLabel
		? joinTitleSegments(`Preview Changes for ${itemTitle}`, pageLabel)
		: `Preview Changes for ${itemTitle}`;
}
