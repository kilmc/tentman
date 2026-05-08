import type { Editor } from '@tiptap/core';

export interface MarkdownToolbarDialogFieldOption {
	label: string;
	value: string;
}

export interface MarkdownToolbarDialogField {
	id: string;
	label: string;
	type?: 'text' | 'url' | 'select';
	required?: boolean;
	defaultValue?: string;
	options?: MarkdownToolbarDialogFieldOption[];
}

export interface MarkdownToolbarDialogContribution {
	title: string;
	submitLabel?: string;
	fields: MarkdownToolbarDialogField[];
	getInitialValues?(editor: Editor): Record<string, string>;
	serialize?(values: Record<string, string>): string | null | undefined;
	validate?(values: Record<string, string>): string | null | undefined;
	submit(editor: Editor, values: Record<string, string>): void;
}

export interface MarkdownToolbarItemContribution {
	id: string;
	label: string;
	buttonLabel?: string;
	run?(editor: Editor): void;
	isActive?(editor: Editor): boolean;
	dialog?: MarkdownToolbarDialogContribution;
}
