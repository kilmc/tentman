import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
import { getBlockStorageKey } from '$lib/config/tentman-group';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';
import type { FormContentContext } from '$lib/components/form/form-content-context';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { CoreContentComponentReferenceEntry } from '@tentman/core/content-components';
import type { Editor } from '@tiptap/core';
import { collectMarkdownFieldReferenceState } from '$lib/components/form/markdown-field-context';
import {
	getMarkdownEditorContentComponentAvailableActions,
	getMarkdownEditorContentComponentCapabilities,
	getMarkdownEditorContentComponentPrimaryAction,
	type MarkdownEditorContentComponentCapabilities,
	type MarkdownEditorContentComponentDirectIntent,
	type MarkdownEditorContentComponentIntent
} from '$lib/features/markdown-editor/content-component-interactions';

const BROKEN_ATTRIBUTE_NAME = '__tentmanBroken';

export interface MarkdownFieldContentComponentNodeSnapshot {
	nodeTypeName: string;
	nodeAttributes: Record<string, unknown>;
}

export interface MarkdownFieldContentComponentReferenceTarget {
	fieldPath: string;
	fieldLabel: string;
}

export interface MarkdownFieldSelectedContentComponentState {
	item: ContentComponentToolbarButton;
	href: string;
	broken: boolean;
	canEdit: boolean;
	referenceTarget: MarkdownFieldContentComponentReferenceTarget | null;
	capabilities: MarkdownEditorContentComponentCapabilities;
	availableActions: MarkdownEditorContentComponentDirectIntent[];
	primaryAction: MarkdownEditorContentComponentIntent;
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

function getSelectedContentComponentNodeSnapshot(
	editor: Editor
): MarkdownFieldContentComponentNodeSnapshot | null {
	const selection = editor.state.selection as {
		node?: {
			type: { name: string };
			attrs?: Record<string, unknown>;
		} | null;
	};
	const selectedNode = selection.node ?? null;
	if (!selectedNode) {
		return null;
	}

	return {
		nodeTypeName: selectedNode.type.name,
		nodeAttributes: { ...(selectedNode.attrs ?? {}) }
	};
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

		if (fieldValue === options.entry.container || fieldValue === options.entry.self) {
			return {
				fieldPath: nextPath,
				fieldLabel: toFieldLabel(block)
			};
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
	item: ContentComponentToolbarButton | null | undefined;
	nodeAttributes: Record<string, unknown> | null | undefined;
	formContentContext: FormContentContext | null;
}): MarkdownFieldContentComponentReferenceTarget | null {
	if (!options.item?.contentComponent?.reference || !options.nodeAttributes) {
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

	let entry: CoreContentComponentReferenceEntry | undefined;
	if (options.item.contentComponent.reference.attributeId) {
		const rawToken = options.nodeAttributes[options.item.contentComponent.reference.attributeId];
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

export function getMarkdownFieldContentComponentState(options: {
	node: MarkdownFieldContentComponentNodeSnapshot | null;
	href?: string | null;
	broken?: boolean;
	componentToolbarButtons: ContentComponentToolbarButton[];
	formContentContext: FormContentContext | null;
}): MarkdownFieldSelectedContentComponentState | null {
	if (!options.node) {
		return null;
	}

	const item = options.componentToolbarButtons.find(
		(button) => button.contentComponent?.nodeName === options.node?.nodeTypeName
	);
	if (!item) {
		return null;
	}

	const href =
		options.href ??
		(typeof options.node.nodeAttributes.href === 'string' ? options.node.nodeAttributes.href : '');
	const broken =
		options.broken ??
		String(options.node.nodeAttributes[BROKEN_ATTRIBUTE_NAME] ?? '') === 'true';
	const canEdit = Boolean(item.contentComponent?.hasEditableFields);
	const referenceTarget = getMarkdownFieldContentComponentReferenceTarget({
		item,
		nodeAttributes: options.node.nodeAttributes,
		formContentContext: options.formContentContext
	});
	const capabilities = getMarkdownEditorContentComponentCapabilities({
		canEdit,
		canJump: Boolean(referenceTarget),
		href,
		broken
	});

	return {
		item,
		href,
		broken,
		canEdit,
		referenceTarget,
		capabilities,
		availableActions: getMarkdownEditorContentComponentAvailableActions(capabilities),
		primaryAction: getMarkdownEditorContentComponentPrimaryAction(capabilities)
	};
}

export function getMarkdownFieldSelectedContentComponentState(options: {
	editor: Editor | null;
	componentToolbarButtons: ContentComponentToolbarButton[];
	formContentContext: FormContentContext | null;
}): MarkdownFieldSelectedContentComponentState | null {
	if (!options.editor) {
		return null;
	}

	return getMarkdownFieldContentComponentState({
		node: getSelectedContentComponentNodeSnapshot(options.editor),
		componentToolbarButtons: options.componentToolbarButtons,
		formContentContext: options.formContentContext
	});
}
