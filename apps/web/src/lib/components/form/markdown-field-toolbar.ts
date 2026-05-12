import type { MarkdownToolbarItemContribution } from '$lib/features/markdown-editor/types';
import type { Editor } from '@tiptap/core';

export type ToolbarIconName =
	| 'paragraph'
	| 'heading1'
	| 'heading2'
	| 'heading3'
	| 'bold'
	| 'italic'
	| 'strike'
	| 'code'
	| 'bulletList'
	| 'orderedList'
	| 'blockquote'
	| 'codeBlock'
	| 'divider'
	| 'link'
	| 'image'
	| 'chevronDown'
	| 'check';

export type StructureValue = 'paragraph' | 'heading1' | 'heading2' | 'heading3';
export type ListValue = 'none' | 'bulletList' | 'orderedList';
export type InlineFormatValue = 'bold' | 'italic' | 'strike' | 'code';

export interface StructureOption {
	value: StructureValue;
	label: string;
	icon: ToolbarIconName;
	run: (editor: Editor) => void;
}

export interface ListOption {
	value: ListValue;
	label: string;
	icon: ToolbarIconName;
	run: (editor: Editor) => void;
}

export interface InlineToggleButton {
	value: InlineFormatValue;
	label: string;
	icon: ToolbarIconName;
	isActive: (editor: Editor) => boolean;
	run: (editor: Editor) => void;
}

export interface ActionToolbarButton {
	id: string;
	label: string;
	icon: ToolbarIconName;
	toggle?: boolean;
	isActive?: (editor: Editor) => boolean;
	run?: (editor: Editor) => void;
	select?: (trigger?: HTMLElement) => void;
}

export interface ContentComponentToolbarButton extends MarkdownToolbarItemContribution {
	buttonLabel: string;
}
