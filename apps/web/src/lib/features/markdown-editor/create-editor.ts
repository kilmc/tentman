import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import FileHandler from '@tiptap/extension-file-handler';
import { Markdown } from '@tiptap/markdown';
import { createMarkdownImageNodeView } from './image-node-view';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';

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
	onLinkClick?: (payload: { href: string; rect: DOMRect }) => void;
	onContentComponentActivate?: () => void;
	contentComponentToolbarButtons?: ContentComponentToolbarButton[];
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

function isModifierClick(event: MouseEvent): boolean {
	return event.metaKey || event.ctrlKey;
}

function isContentComponentTarget(target: Element): boolean {
	return Boolean(target.closest('[data-tentman-content-component-node]'));
}

function openEditorHref(href: unknown): boolean {
	if (typeof href !== 'string') {
		return false;
	}

	const normalizedHref = href.trim();
	if (!normalizedHref) {
		return false;
	}

	window.open(normalizedHref, '_blank', 'noopener');
	return true;
}

function getSelectedContentComponentButton(
	editor: Editor,
	componentToolbarButtons: ContentComponentToolbarButton[]
): ContentComponentToolbarButton | null {
	const selectedNode = 'node' in editor.state.selection ? editor.state.selection.node : null;
	if (!selectedNode) {
		return null;
	}

	return (
		componentToolbarButtons.find(
			(button) => button.contentComponent?.nodeName === selectedNode.type.name
		) ?? null
	);
}

export function createMarkdownEditor(
	options: CreateMarkdownEditorOptions
): MarkdownEditorController {
	let destroyed = false;
	let syncingFromOutside = false;
	let lastKnownMarkdown = options.markdown;

	function runIfActive(callback: () => void) {
		if (destroyed) {
			return;
		}

		callback();
	}

	function reportUiChange() {
		runIfActive(() => {
			options.onUiChange?.();
		});
	}

	function reportError(error: unknown) {
		runIfActive(() => {
			options.onError?.(toErrorMessage(error));
		});
	}

	const editor = new Editor({
		content: options.markdown,
		contentType: 'markdown',
		editable: true,
		editorProps: {
			attributes: {
				class:
					'ProseMirror markdown-editor-content prose prose-sm max-w-none focus:outline-none prose-headings:font-semibold prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-stone-200 prose-pre:bg-stone-100 prose-pre:px-4 prose-pre:py-3 prose-pre:text-stone-800 prose-pre:font-mono prose-pre:shadow-none'
			},
			handleClick(view, _pos, event) {
				const target = event.target;
				if (!(target instanceof Element)) {
					return false;
				}

				const anchor = target.closest('a[href]');
				if (!(anchor instanceof HTMLAnchorElement) || !view.dom.contains(anchor)) {
					return false;
				}

				if (isContentComponentTarget(anchor)) {
					return isModifierClick(event) ? openEditorHref(anchor.getAttribute('href')) : false;
				}

				if (isModifierClick(event)) {
					return openEditorHref(anchor.getAttribute('href'));
				}

				const href = anchor.getAttribute('href')?.trim();
				if (!href) {
					return false;
				}

				queueMicrotask(() => {
					runIfActive(() => {
						options.onLinkClick?.({
							href,
							rect: anchor.getBoundingClientRect()
						});
					});
				});

				return false;
			},
			handleClickOn(_view, _pos, node, _nodePos, event) {
				if (!isModifierClick(event)) {
					return false;
				}

				return openEditorHref(node.attrs.href);
			},
			handleKeyDown(view, event) {
				const selectedComponent = getSelectedContentComponentButton(
					editor,
					options.contentComponentToolbarButtons ?? []
				);
				if (!selectedComponent) {
					return false;
				}

				if (event.key === 'Backspace' || event.key === 'Delete') {
					event.preventDefault();
					view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
					return true;
				}

				if (event.key === 'Enter') {
					event.preventDefault();
					options.onContentComponentActivate?.();
					return true;
				}

				return false;
			},
			handleTextInput(view, _from, _to, text) {
				const selectedComponent = getSelectedContentComponentButton(
					editor,
					options.contentComponentToolbarButtons ?? []
				);
				if (!selectedComponent) {
					return false;
				}

				view.dispatch(
					view.state.tr.insertText(text, view.state.selection.from, view.state.selection.to).scrollIntoView()
				);
				return true;
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
					void insertImageFiles(files).catch(reportError);
				},
				onDrop: (_editor, files, position) => {
					void insertImageFiles(files, position).catch(reportError);
				}
			}),
			Markdown,
			...(options.extensions ?? [])
		],
		onCreate: () => {
			reportUiChange();
		},
		onTransaction: () => {
			reportUiChange();
		},
		onUpdate: ({ editor: activeEditor }) => {
			if (destroyed || syncingFromOutside) {
				return;
			}

			const nextMarkdown = activeEditor.getMarkdown();
			if (nextMarkdown === lastKnownMarkdown) {
				return;
			}

			lastKnownMarkdown = nextMarkdown;
			runIfActive(() => {
				options.onMarkdownChange(nextMarkdown);
			});
		}
	});

	async function insertImageFiles(files: File[], position?: number): Promise<void> {
		for (const [index, file] of files.entries()) {
			const staged = await options.stageImage(file);
			if (destroyed) {
				return;
			}

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
			if (destroyed || markdown === lastKnownMarkdown) {
				return;
			}

			lastKnownMarkdown = markdown;
			syncingFromOutside = true;
			editor.commands.setContent(markdown, {
				contentType: 'markdown'
			});
			syncingFromOutside = false;
			reportUiChange();
		},
		destroy() {
			destroyed = true;
			editor.destroy();
		}
	};
}
