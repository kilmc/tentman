import { getCardFields } from '$lib/features/forms/helpers';
import type { BlockUsage } from '$lib/config/types';
import { formatContentValue, getItemId, getItemRoute } from '$lib/features/content-management/item';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { ParsedContentConfig } from '$lib/config/parse';

export type SupportedExplicitItemLabelSourceType = 'text' | 'date';

export interface ItemLabelSchemaAnalysisIssue {
	code:
		| 'item-label.multiple-explicit-sources'
		| 'item-label.unsupported-source-type'
		| 'item-label.invalid-format-target';
	blockId?: string;
	message: string;
}

export interface ItemLabelSchemaAnalysis {
	resolvedBlock: BlockUsage | null;
	issues: ItemLabelSchemaAnalysisIssue[];
}

export interface ResolvedItemLabelValue {
	label: string;
	sourceBlockId: string;
	sourceType: SupportedExplicitItemLabelSourceType;
}

export interface ContentItemTitleResolution {
	title: string;
	usedFallback: boolean;
	sourceBlockId?: string;
	sourceType?: SupportedExplicitItemLabelSourceType;
}

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'long',
	day: 'numeric'
};

function isSupportedExplicitItemLabelType(
	type: string
): type is SupportedExplicitItemLabelSourceType {
	return type === 'text' || type === 'date';
}

function dedupeLocales(locales: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const locale of locales) {
		if (!locale) {
			continue;
		}

		const normalized = locale.trim();
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		seen.add(normalized);
		result.push(normalized);
	}

	return result;
}

function getRuntimeLocales(): string[] {
	return dedupeLocales([
		...(typeof navigator !== 'undefined'
			? [...(navigator.languages ?? []), navigator.language]
			: []),
		'en-US'
	]);
}

function normalizeExplicitTextValue(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	const normalized = String(value).trim().replace(/\s+/g, ' ');
	return normalized.length > 0 ? normalized : null;
}

function parseDateValue(value: unknown): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (value === null || value === undefined || value === '') {
		return null;
	}

	const parsed = new Date(String(value));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateValue(
	value: unknown,
	options?: Intl.DateTimeFormatOptions,
	locales?: string | string[]
): string | null {
	const parsed = parseDateValue(value);
	if (!parsed) {
		return null;
	}

	const localeList = dedupeLocales([
		...(Array.isArray(locales) ? locales : locales ? [locales] : []),
		...getRuntimeLocales()
	]);

	try {
		return new Intl.DateTimeFormat(localeList, options ?? DEFAULT_DATE_FORMAT).format(parsed);
	} catch {
		return new Intl.DateTimeFormat(localeList, DEFAULT_DATE_FORMAT).format(parsed);
	}
}

function formatRepeatableDisplayableValue(value: unknown): string | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}

	if (typeof value === 'string') {
		const label = String(value).trim();
		return label.length > 0 ? label : null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return null;
}

function isIdentityTitleField(config: ParsedContentConfig, blockId: string): boolean {
	if (config.idField === blockId) {
		return true;
	}

	return ['slug', 'route', 'path', 'filename', '_filename'].includes(blockId);
}

function isTitleBlock(block: BlockUsage): boolean {
	return (
		['text', 'textarea', 'markdown'].includes(block.type) &&
		(block.id === 'title' || block.label?.trim().toLowerCase() === 'title')
	);
}

function getAutomaticTitleCandidateBlocks(config: ParsedContentConfig): BlockUsage[] {
	const cardFields = getCardFields(config);
	const candidates = [...cardFields.primary, ...cardFields.secondary, ...config.blocks];
	const seenFieldIds = new Set<string>();
	const uniqueCandidates: BlockUsage[] = [];

	for (const block of candidates) {
		if (seenFieldIds.has(block.id)) {
			continue;
		}

		seenFieldIds.add(block.id);
		uniqueCandidates.push(block);
	}

	return [
		...uniqueCandidates.filter(isTitleBlock),
		...uniqueCandidates.filter((block) => block.type === 'date')
	];
}

export function analyzeItemLabelSchemaUnit(blocks: BlockUsage[]): ItemLabelSchemaAnalysis {
	const issues: ItemLabelSchemaAnalysisIssue[] = [];
	const explicitBlocks = blocks.filter((block) => block.isItemLabel === true);

	for (const block of blocks) {
		if (block.itemLabelFormat && !(block.isItemLabel === true && block.type === 'date')) {
			issues.push({
				code: 'item-label.invalid-format-target',
				blockId: block.id,
				message:
					'itemLabelFormat only applies to date blocks with isItemLabel: true. This format will be ignored.'
			});
		}
	}

	if (explicitBlocks.length > 1) {
		issues.push({
			code: 'item-label.multiple-explicit-sources',
			blockId: explicitBlocks[0]?.id,
			message: `Only one block per schema unit can use isItemLabel: true. Found ${explicitBlocks
				.map((block) => `"${block.id}"`)
				.join(
					', '
				)}. Tentman will ignore all explicit item labels in this schema unit and fall back to the existing label heuristic.`
		});

		return {
			resolvedBlock: null,
			issues
		};
	}

	const [explicitBlock] = explicitBlocks;
	if (!explicitBlock) {
		return {
			resolvedBlock: null,
			issues
		};
	}

	if (!isSupportedExplicitItemLabelType(explicitBlock.type)) {
		issues.push({
			code: 'item-label.unsupported-source-type',
			blockId: explicitBlock.id,
			message: `Block "${explicitBlock.id}" uses isItemLabel: true on unsupported type "${explicitBlock.type}". Only text and date are supported in v1, so Tentman will fall back to the existing label heuristic.`
		});

		return {
			resolvedBlock: null,
			issues
		};
	}

	return {
		resolvedBlock: explicitBlock,
		issues
	};
}

export function resolveExplicitItemLabelValue(
	blocks: BlockUsage[],
	item: ContentRecord,
	options: { locales?: string | string[] } = {}
): ResolvedItemLabelValue | null {
	const analysis = analyzeItemLabelSchemaUnit(blocks);
	const block = analysis.resolvedBlock;

	if (!block) {
		return null;
	}

	if (block.type === 'text') {
		const label = normalizeExplicitTextValue(item[block.id]);
		return label
			? {
					label,
					sourceBlockId: block.id,
					sourceType: 'text'
				}
			: null;
	}

	const label = formatDateValue(item[block.id], block.itemLabelFormat, options.locales);
	return label
		? {
				label,
				sourceBlockId: block.id,
				sourceType: 'date'
			}
		: null;
}

export function resolveContentItemTitle(
	config: ParsedContentConfig,
	item: ContentRecord,
	options: { locales?: string | string[] } = {}
): ContentItemTitleResolution {
	const explicitLabel = resolveExplicitItemLabelValue(config.blocks, item, options);
	if (explicitLabel) {
		return {
			title: explicitLabel.label,
			usedFallback: false,
			sourceBlockId: explicitLabel.sourceBlockId,
			sourceType: explicitLabel.sourceType
		};
	}

	for (const block of getAutomaticTitleCandidateBlocks(config)) {
		const value = item[block.id];
		if (value === undefined || value === null || value === '') {
			continue;
		}

		const formattedValue = formatContentValue(value);
		if (formattedValue === '—' || formattedValue === '[Object]') {
			continue;
		}

		return {
			title: formattedValue,
			usedFallback: isIdentityTitleField(config, block.id)
		};
	}

	return {
		title: getItemRoute(config, item) ?? getItemId(item) ?? getConfigItemLabel(config),
		usedFallback: true
	};
}

export function getRepeatableItemLabel(
	item: unknown,
	index: number,
	blocks: BlockUsage[],
	itemLabel?: string,
	options: { locales?: string | string[] } = {}
): string {
	const fallback = `Item ${index + 1}`;
	const prefix = itemLabel?.trim();

	if (item && typeof item === 'object' && !Array.isArray(item)) {
		const record = item as ContentRecord;
		const explicitLabel = resolveExplicitItemLabelValue(blocks, record, options);

		if (explicitLabel) {
			return prefix ? `${prefix} ${index + 1}: ${explicitLabel.label}` : explicitLabel.label;
		}

		const textBlocks = blocks.filter((block) =>
			['text', 'textarea', 'markdown', 'email', 'url'].includes(block.type)
		);
		const imageBlocks = blocks.filter((block) => block.type === 'image');
		const labelBlocks = [...textBlocks, ...imageBlocks];

		for (const block of labelBlocks) {
			const valueLabel = formatRepeatableDisplayableValue(record[block.id]);
			if (valueLabel) {
				return prefix ? `${prefix} ${index + 1}: ${valueLabel}` : valueLabel;
			}
		}
	}

	return prefix ? `${prefix} ${index + 1}` : fallback;
}

export function getConfigItemLabel(config: ParsedContentConfig): string {
	if (config.itemLabel?.trim()) {
		return config.itemLabel.trim();
	}

	const label = config.label.trim();
	if (!label) {
		return 'Item';
	}

	return label.endsWith('s') && label.length > 1 ? label.slice(0, -1) : label;
}
