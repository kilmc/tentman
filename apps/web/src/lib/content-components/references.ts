import {
	collectContentComponentReferenceIndex,
	type CoreContentComponentReferenceEntry
} from '@tentman/core/content-components';
import { getStructuredBlocksForUsage, type BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import { getBlockStorageKey } from '$lib/config/tentman-group';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { MarkdownToolbarDialogFieldOption } from '$lib/features/markdown-editor/types';

interface ReferenceOption {
	label: string;
	value: string;
}

interface ReferenceEntry {
	binding: string;
	token: string;
	field: string;
	self: unknown;
	container: ContentRecord;
	full: ContentRecord;
}

function getReferenceBindings(value: unknown): string[] {
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized.length > 0 ? [normalized] : [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((entry) => {
			if (typeof entry !== 'string') {
				return [];
			}

			const normalized = entry.trim();
			return normalized.length > 0 ? [normalized] : [];
		});
	}

	return [];
}

function isStringRecord(value: unknown): value is ContentRecord {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function resolveReferenceLabel(blocks: BlockUsage[], value: ContentRecord): string | null {
	for (const block of blocks) {
		if (block.referenceLabel !== true) {
			continue;
		}

		const labelValue = value[getBlockStorageKey(block)];
		if (typeof labelValue !== 'string') {
			continue;
		}

		const normalizedLabel = labelValue.trim();
		if (normalizedLabel.length > 0) {
			return normalizedLabel;
		}
	}

	return null;
}

export function collectContentComponentReferenceState(options: {
	blocks: BlockUsage[];
	contentItem: ContentRecord;
	blockRegistry: BlockRegistry;
}): {
	referenceIndex: Map<string, Map<string, ReferenceEntry>>;
	optionsByBinding: Map<string, MarkdownToolbarDialogFieldOption[]>;
	errors: string[];
} {
	const referenceState = collectContentComponentReferenceIndex({
		blocks: options.blocks,
		contentItem: options.contentItem,
		resolveStructuredBlocks: (block: BlockUsage) =>
			getStructuredBlocksForUsage(block, options.blockRegistry)?.blocks ?? null
	});
	const optionsByBinding = new Map<string, ReferenceOption[]>();

	function registerOption(binding: string, token: string, label: string) {
		const existing = optionsByBinding.get(binding) ?? [];
		if (existing.some((option) => option.value === token)) {
			return;
		}

		existing.push({
			value: token,
			label
		});
		optionsByBinding.set(binding, existing);
	}

	function walk(blocks: BlockUsage[], value: unknown) {
		if (!isStringRecord(value)) {
			return;
		}

		for (const block of blocks) {
			const storageKey = getBlockStorageKey(block);
			const structuredBlocks =
				getStructuredBlocksForUsage(block, options.blockRegistry)?.blocks ?? null;
			const fieldValue = value[storageKey];

			if (structuredBlocks) {
				if (block.collection) {
					if (!Array.isArray(fieldValue)) {
						continue;
					}

					for (const item of fieldValue) {
						walk(structuredBlocks, item);
					}

					continue;
				}

				walk(structuredBlocks, fieldValue);
				continue;
			}

			if (typeof fieldValue !== 'string') {
				continue;
			}

			const token = fieldValue.trim();
			if (token.length === 0) {
				continue;
			}

			const bindings = getReferenceBindings(block.referenceFor);
			if (bindings.length === 0) {
				continue;
			}

			const label = resolveReferenceLabel(blocks, value) ?? token;
			for (const binding of bindings) {
				if (!referenceState.referenceIndex.get(binding)?.has(token)) {
					continue;
				}

				registerOption(binding, token, label);
			}
		}
	}

	walk(options.blocks, options.contentItem);

	return {
		referenceIndex: referenceState.referenceIndex as Map<
			string,
			Map<string, CoreContentComponentReferenceEntry & ReferenceEntry>
		>,
		optionsByBinding: new Map(
			Array.from(optionsByBinding.entries()).map(([binding, entries]) => [
				binding,
				entries.sort((left, right) => left.label.localeCompare(right.label))
			])
		),
		errors: referenceState.errors
	};
}
