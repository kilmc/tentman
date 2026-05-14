import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
import { getBlockStorageKey } from '$lib/config/tentman-group';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { FormContentContext } from '$lib/components/form/form-content-context';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { Editor } from '@tiptap/core';
import type { CoreContentComponentReferenceEntry } from '$lib/types/tentman-core-content-components';
import { collectMarkdownFieldReferenceState } from '$lib/components/form/markdown-field-context';

interface SelectedContentComponentState {
	item: ContentComponentToolbarButton;
}

export interface MarkdownFieldContentComponentReferenceTarget {
	fieldPath: string;
	fieldLabel: string;
}

export interface MarkdownFieldSelectedContentComponentState {
	item: ContentComponentToolbarButton;
	canEdit: boolean;
	referenceTarget: MarkdownFieldContentComponentReferenceTarget | null;
}

function toFieldLabel(block: BlockUsage): string {
	if (block.label?.trim()) {
		return block.label.trim();
	}

	return block.id
		.replace(/([A-Z])/g, ' $1')
		.replace(/_/g, ' ')
		.replace(/^./, (segment) => segment.toUpperCase())
		.trim();
}

function isContentRecord(value: unknown): value is ContentRecord {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getSelectedContentComponentState(
	editor: Editor,
	componentToolbarButtons: ContentComponentToolbarButton[]
): SelectedContentComponentState | null {
	const selectedNode = 'node' in editor.state.selection ? editor.state.selection.node : null;
	if (!selectedNode) {
		return null;
	}

	const item = componentToolbarButtons.find(
		(button) => button.contentComponent?.nodeName === selectedNode.type.name
	);
	return item ? { item } : null;
}

function findReferenceTargetPath(options: {
	blocks: BlockUsage[];
	value: ContentRecord;
	fieldPath?: string;
	entry: CoreContentComponentReferenceEntry;
	formContentContext: FormContentContext;
}): MarkdownFieldContentComponentReferenceTarget | null {
	for (const block of options.blocks) {
		const storageKey = getBlockStorageKey(block);
		const nextPath = options.fieldPath ? `${options.fieldPath}.${storageKey}` : storageKey;
		const fieldValue = options.value[storageKey];

		if (storageKey === options.entry.field && fieldValue === options.entry.self) {
			return {
				fieldPath: nextPath,
				fieldLabel: toFieldLabel(block)
			};
		}

		const structuredBlocks =
			getStructuredBlocksForUsage(block, options.formContentContext.getBlockRegistry())?.blocks ?? null;
		if (!structuredBlocks) {
			continue;
		}

		if (block.collection) {
			if (!Array.isArray(fieldValue)) {
				continue;
			}

			for (const [index, item] of fieldValue.entries()) {
				if (!isContentRecord(item)) {
					continue;
				}

				const match = findReferenceTargetPath({
					...options,
					blocks: structuredBlocks,
					value: item,
					fieldPath: `${nextPath}[${index}]`
				});
				if (match) {
					return match;
				}
			}

			continue;
		}

		if (!isContentRecord(fieldValue)) {
			continue;
		}

		const match = findReferenceTargetPath({
			...options,
			blocks: structuredBlocks,
			value: fieldValue,
			fieldPath: nextPath
		});
		if (match) {
			return match;
		}
	}

	return null;
}

export function getMarkdownFieldContentComponentReferenceTarget(options: {
	editor: Editor | null;
	item: ContentComponentToolbarButton | null | undefined;
	formContentContext: FormContentContext | null;
}): MarkdownFieldContentComponentReferenceTarget | null {
	if (!options.editor || !options.item?.contentComponent?.reference) {
		return null;
	}

	const referenceState = collectMarkdownFieldReferenceState(options.formContentContext);
	if (!referenceState) {
		return null;
	}

	const bindingIndex = referenceState.referenceIndex.get(options.item.contentComponent.reference.binding);
	if (!bindingIndex || bindingIndex.size === 0) {
		return null;
	}

	const selectedNode = 'node' in options.editor.state.selection ? options.editor.state.selection.node : null;
	if (!selectedNode) {
		return null;
	}

	let entry: CoreContentComponentReferenceEntry | undefined;
	if (options.item.contentComponent.reference.attributeId) {
		const rawToken = selectedNode.attrs?.[options.item.contentComponent.reference.attributeId];
		const token = typeof rawToken === 'string' ? rawToken.trim() : '';
		if (!token) {
			return null;
		}

		entry = bindingIndex.get(token) as CoreContentComponentReferenceEntry | undefined;
	} else if (bindingIndex.size === 1) {
		entry = Array.from(bindingIndex.values())[0] as CoreContentComponentReferenceEntry | undefined;
	}

	if (!entry || !options.formContentContext) {
		return null;
	}

	return findReferenceTargetPath({
		blocks: options.formContentContext.getRootBlocks(),
		value: options.formContentContext.getRootData(),
		entry,
		formContentContext: options.formContentContext
	});
}

function getSelectedReferenceTarget(
	editor: Editor,
	item: ContentComponentToolbarButton,
	formContentContext: FormContentContext | null
): MarkdownFieldContentComponentReferenceTarget | null {
	return getMarkdownFieldContentComponentReferenceTarget({
		editor,
		item,
		formContentContext
	});
}

export function getMarkdownFieldSelectedContentComponentState(options: {
	editor: Editor | null;
	componentToolbarButtons: ContentComponentToolbarButton[];
	formContentContext: FormContentContext | null;
}): MarkdownFieldSelectedContentComponentState | null {
	if (!options.editor) {
		return null;
	}

	const selected = getSelectedContentComponentState(options.editor, options.componentToolbarButtons);
	if (!selected) {
		return null;
	}

	return {
		item: selected.item,
		canEdit: Boolean(selected.item.contentComponent?.hasEditableFields),
		referenceTarget: getSelectedReferenceTarget(
			options.editor,
			selected.item,
			options.formContentContext
		)
	};
}
