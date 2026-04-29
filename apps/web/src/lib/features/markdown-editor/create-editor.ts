import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import FileHandler from '@tiptap/extension-file-handler';
import { Markdown } from '@tiptap/markdown';
import { createMarkdownImageNodeView } from './image-node-view';

interface MarkdownImageNodeOptions extends ImageOptions {
	assetsDir?: string;
	storagePath?: string;
}

interface CreateMarkdownEditorOptions {
	markdown: string;
	placeholder?: string;
	assetsDir?: string;
	storagePath?: string;
	extensions?: Extensions;
	onMarkdownChange(markdown: string): void;
	onUiChange?: () => void;
	onError?: (message: string) => void;
	stageImage(file: File): Promise<{ ref: string }>;
}

export interface MarkdownEditorController {
	editor: Editor;
	insertImageFiles(files: File[], position?: number): Promise<void>;
	setMarkdown(markdown: string): void;
	destroy(): void;
}

const MarkdownImage = Image.extend<MarkdownImageNodeOptions>({
	addOptions() {
		const parentOptions = this.parent?.();

		return {
			inline: parentOptions?.inline ?? false,
			allowBase64: parentOptions?.allowBase64 ?? false,
			HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
			resize: parentOptions?.resize ?? false,
			assetsDir: undefined,
			storagePath: undefined
		};
	},

	addNodeView() {
		return (props) =>
			createMarkdownImageNodeView(props, {
				assetsDir: this.options.assetsDir,
				storagePath: this.options.storagePath
			});
	}
});

function createImageNode(ref: string): JSONContent {
	return {
		type: 'image',
		attrs: {
			src: ref,
			alt: ''
		}
	};
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Failed to stage image';
}

export function createMarkdownEditor(
	options: CreateMarkdownEditorOptions
): MarkdownEditorController {
	let syncingFromOutside = false;
	let lastKnownMarkdown = options.markdown;

	const editor = new Editor({
		content: options.markdown,
		contentType: 'markdown',
		editable: true,
		editorProps: {
			attributes: {
				class:
					'ProseMirror markdown-editor-content prose prose-sm max-w-none focus:outline-none prose-headings:font-semibold prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-stone-200 prose-pre:bg-stone-100 prose-pre:px-4 prose-pre:py-3 prose-pre:text-stone-800 prose-pre:font-mono prose-pre:shadow-none'
			}
		},
		extensions: [
			StarterKit.configure({
				heading: {
					levels: [1, 2, 3]
				},
				link: {
					openOnClick: false,
					autolink: true
				}
			}),
			MarkdownImage.configure({
				allowBase64: true,
				assetsDir: options.assetsDir,
				storagePath: options.storagePath
			}),
			Placeholder.configure({
				placeholder: options.placeholder ?? 'Write in Markdown'
			}),
			FileHandler.configure({
				onPaste: (_editor, files) => {
					void insertImageFiles(files).catch((error) => {
						options.onError?.(toErrorMessage(error));
					});
				},
				onDrop: (_editor, files, position) => {
					void insertImageFiles(files, position).catch((error) => {
						options.onError?.(toErrorMessage(error));
					});
				}
			}),
			Markdown,
			...(options.extensions ?? [])
		],
		onCreate: () => {
			options.onUiChange?.();
		},
		onTransaction: () => {
			options.onUiChange?.();
		},
		onUpdate: ({ editor: activeEditor }) => {
			if (syncingFromOutside) {
				return;
			}

			const nextMarkdown = activeEditor.getMarkdown();
			if (nextMarkdown === lastKnownMarkdown) {
				return;
			}

			lastKnownMarkdown = nextMarkdown;
			options.onMarkdownChange(nextMarkdown);
		}
	});

	async function insertImageFiles(files: File[], position?: number): Promise<void> {
		for (const [index, file] of files.entries()) {
			const staged = await options.stageImage(file);
			const targetPosition = index === 0 ? position : undefined;

			if (typeof targetPosition === 'number') {
				editor.chain().focus().insertContentAt(targetPosition, createImageNode(staged.ref)).run();
				continue;
			}

			editor.chain().focus().insertContent(createImageNode(staged.ref)).run();
		}
	}

	return {
		editor,
		insertImageFiles,
		setMarkdown(markdown: string) {
			if (markdown === lastKnownMarkdown) {
				return;
			}

			lastKnownMarkdown = markdown;
			syncingFromOutside = true;
			editor.commands.setContent(markdown, {
				contentType: 'markdown'
			});
			syncingFromOutside = false;
			options.onUiChange?.();
		},
		destroy() {
			editor.destroy();
		}
	};
}
