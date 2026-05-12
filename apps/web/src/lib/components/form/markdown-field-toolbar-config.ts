import type { Editor } from '@tiptap/core';
import type {
	ActionToolbarButton,
	InlineToggleButton,
	ListOption,
	StructureOption
} from '$lib/components/form/markdown-field-toolbar';

interface ToolbarConfigOptions {
	onselectlink: (trigger?: HTMLElement) => void;
	onselectimage: (trigger?: HTMLElement) => void;
}

export function createMarkdownFieldToolbarConfig(
	options: ToolbarConfigOptions
): {
	structureOptions: StructureOption[];
	listOptions: ListOption[];
	inlineToggleButtons: InlineToggleButton[];
	actionButtons: ActionToolbarButton[];
} {
	const structureOptions: StructureOption[] = [
		{
			value: 'paragraph',
			label: 'Paragraph',
			icon: 'paragraph',
			run: (editor) => editor.chain().focus().setParagraph().run()
		},
		{
			value: 'heading1',
			label: 'Heading 1',
			icon: 'heading1',
			run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
		},
		{
			value: 'heading2',
			label: 'Heading 2',
			icon: 'heading2',
			run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			value: 'heading3',
			label: 'Heading 3',
			icon: 'heading3',
			run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
		}
	];

	const listOptions: ListOption[] = [
		{
			value: 'none',
			label: 'No list',
			icon: 'paragraph',
			run: (editor) => editor.chain().focus().liftListItem('listItem').run()
		},
		{
			value: 'bulletList',
			label: 'Bulleted list',
			icon: 'bulletList',
			run: (editor) => editor.chain().focus().toggleBulletList().run()
		},
		{
			value: 'orderedList',
			label: 'Numbered list',
			icon: 'orderedList',
			run: (editor) => editor.chain().focus().toggleOrderedList().run()
		}
	];

	const inlineToggleButtons: InlineToggleButton[] = [
		{
			value: 'bold',
			label: 'Bold',
			icon: 'bold',
			isActive: (editor) => editor.isActive('bold'),
			run: (editor) => editor.chain().focus().toggleBold().run()
		},
		{
			value: 'italic',
			label: 'Italic',
			icon: 'italic',
			isActive: (editor) => editor.isActive('italic'),
			run: (editor) => editor.chain().focus().toggleItalic().run()
		},
		{
			value: 'strike',
			label: 'Strikethrough',
			icon: 'strike',
			isActive: (editor) => editor.isActive('strike'),
			run: (editor) => editor.chain().focus().toggleStrike().run()
		},
		{
			value: 'code',
			label: 'Inline code',
			icon: 'code',
			isActive: (editor) => editor.isActive('code'),
			run: (editor) => editor.chain().focus().toggleCode().run()
		}
	];

	const actionButtons: ActionToolbarButton[] = [
		{
			id: 'blockquote',
			label: 'Block quote',
			icon: 'blockquote',
			toggle: true,
			isActive: (editor) => editor.isActive('blockquote'),
			run: (editor) => editor.chain().focus().toggleBlockquote().run()
		},
		{
			id: 'code-block',
			label: 'Code block',
			icon: 'codeBlock',
			toggle: true,
			isActive: (editor) => editor.isActive('codeBlock'),
			run: (editor) => editor.chain().focus().toggleCodeBlock().run()
		},
		{
			id: 'divider',
			label: 'Divider',
			icon: 'divider',
			run: (editor) => editor.chain().focus().setHorizontalRule().run()
		},
		{
			id: 'link',
			label: 'Link',
			icon: 'link',
			toggle: true,
			isActive: (editor) => editor.isActive('link'),
			select: options.onselectlink
		},
		{
			id: 'image',
			label: 'Image',
			icon: 'image',
			select: options.onselectimage
		}
	];

	return {
		structureOptions,
		listOptions,
		inlineToggleButtons,
		actionButtons
	};
}
