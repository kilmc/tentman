import {
	findMarkdownFieldListOption,
	findMarkdownFieldStructureOption,
	getMarkdownFieldActiveInlineFormatValues,
	getMarkdownFieldChangedInlineFormatValue
} from '$lib/components/form/markdown-field-toolbar-state';
import type {
	ActionToolbarButton,
	ContentComponentToolbarButton,
	InlineToggleButton,
	ListOption,
	ListValue,
	StructureOption,
	StructureValue
} from '$lib/components/form/markdown-field-toolbar';
import type { Editor } from '@tiptap/core';

export function isMarkdownFieldToolbarItemActive(
	editor: Editor | null,
	item: { isActive?: (editor: Editor) => boolean }
): boolean {
	if (!editor || !item.isActive) {
		return false;
	}

	return item.isActive(editor);
}

export function activateMarkdownFieldToolbarItem(options: {
	item: ActionToolbarButton | InlineToggleButton | ContentComponentToolbarButton;
	trigger?: HTMLElement;
	onselect: (trigger?: HTMLElement) => void;
	onopendialog: (item: ContentComponentToolbarButton, trigger?: HTMLElement) => void;
	onrun: (callback: (editor: Editor) => void) => void;
}) {
	if ('select' in options.item && options.item.select) {
		options.onselect(options.trigger);
		return;
	}

	if ('dialog' in options.item && options.item.dialog) {
		options.onopendialog(options.item, options.trigger);
		return;
	}

	if (!options.item.run) {
		return;
	}

	options.onrun(options.item.run);
}

export function applyMarkdownFieldStructureValue(options: {
	editor: Editor | null;
	nextValue: StructureValue;
	structureOptions: StructureOption[];
	onrun: (callback: (editor: Editor) => void) => void;
}) {
	if (!options.editor) {
		return;
	}

	const option = findMarkdownFieldStructureOption(options.nextValue, options.structureOptions);
	if (!option) {
		return;
	}

	options.onrun(option.run);
}

export function applyMarkdownFieldListValue(options: {
	editor: Editor | null;
	nextValue: ListValue;
	listOptions: ListOption[];
	onrun: (callback: (editor: Editor) => void) => void;
}) {
	if (!options.editor) {
		return;
	}

	const option = findMarkdownFieldListOption(options.nextValue, options.listOptions);
	if (!option) {
		return;
	}

	options.onrun(option.run);
}

export function applyMarkdownFieldInlineFormatChange(options: {
	editor: Editor | null;
	nextValues: string[];
	inlineToggleButtons: InlineToggleButton[];
	onrun: (callback: (editor: Editor) => void) => void;
}) {
	if (!options.editor) {
		return;
	}

	const changedValue = getMarkdownFieldChangedInlineFormatValue({
		nextValues: options.nextValues,
		currentValues: getMarkdownFieldActiveInlineFormatValues(options.editor, options.inlineToggleButtons)
	});
	if (!changedValue) {
		return;
	}

	const item = options.inlineToggleButtons.find((button) => button.value === changedValue);
	if (!item) {
		return;
	}

	options.onrun(item.run);
}
