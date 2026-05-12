import type {
	InlineFormatValue,
	InlineToggleButton,
	ListOption,
	ListValue,
	StructureOption,
	StructureValue
} from '$lib/components/form/markdown-field-toolbar';
import type { Editor } from '@tiptap/core';

export function getMarkdownFieldActiveStructureValue(editor: Editor | null): StructureValue {
	if (!editor) {
		return 'paragraph';
	}

	if (editor.isActive('heading', { level: 1 })) {
		return 'heading1';
	}

	if (editor.isActive('heading', { level: 2 })) {
		return 'heading2';
	}

	if (editor.isActive('heading', { level: 3 })) {
		return 'heading3';
	}

	return 'paragraph';
}

export function getMarkdownFieldActiveListValue(editor: Editor | null): ListValue {
	if (!editor) {
		return 'none';
	}

	if (editor.isActive('bulletList')) {
		return 'bulletList';
	}

	if (editor.isActive('orderedList')) {
		return 'orderedList';
	}

	return 'none';
}

export function getMarkdownFieldActiveInlineFormatValues(
	editor: Editor | null,
	inlineToggleButtons: InlineToggleButton[]
): InlineFormatValue[] {
	if (!editor) {
		return [];
	}

	return inlineToggleButtons.filter((item) => item.isActive(editor)).map((item) => item.value);
}

export function findMarkdownFieldStructureOption(
	value: StructureValue,
	structureOptions: StructureOption[]
): StructureOption | undefined {
	return structureOptions.find((item) => item.value === value);
}

export function findMarkdownFieldListOption(
	value: ListValue,
	listOptions: ListOption[]
): ListOption | undefined {
	return listOptions.find((item) => item.value === value);
}

export function getMarkdownFieldChangedInlineFormatValue(options: {
	nextValues: string[];
	currentValues: InlineFormatValue[];
}): InlineFormatValue | null {
	const currentValueSet = new Set(options.currentValues);
	const nextValueSet = new Set(options.nextValues as InlineFormatValue[]);

	return (
		(options.nextValues.find((value) => !currentValueSet.has(value as InlineFormatValue)) as
			| InlineFormatValue
			| undefined) ??
		Array.from(currentValueSet).find((value) => !nextValueSet.has(value)) ??
		null
	);
}
