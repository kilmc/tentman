import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import FileHandler from '@tiptap/extension-file-handler';
import { Markdown } from '@tiptap/markdown';
import { createMarkdownImageNodeView } from './image-node-view';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import {
	createMarkdownEditorContentComponentActivationRequest,
	isMarkdownEditorContentComponentNode,
	type MarkdownEditorContentComponentActivationRequest
} from '$lib/features/markdown-editor/content-component-interactions';

interface MarkdownImageNodeOptions extends ImageOptions {
	assetsDir?: string;
	storagePath?: string;
}

interface ContentComponentLikeNode {
	type: {
		name: string;
	};
	attrs?: Record<string, unknown>;
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
	onContentComponentActivate?: (payload: MarkdownEditorContentComponentActivationRequest) => void;
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

function getContentComponentActivationRequestFromTarget(options: {
	view: Editor['view'];
	target: EventTarget | null;
	componentToolbarButtons: ContentComponentToolbarButton[];
}): MarkdownEditorContentComponentActivationRequest | null {
	if (!(options.target instanceof Element)) {
		return null;
	}

	const contentComponentDom = options.target.closest('[data-tentman-content-component-node]');
	if (!(contentComponentDom instanceof Element) || !options.view.dom.contains(contentComponentDom)) {
		return null;
	}

	try {
		const nodePos = options.view.posAtDOM(contentComponentDom, 0);
		const node = options.view.state.doc.nodeAt(nodePos);
		if (!node || !isMarkdownEditorContentComponentNode(node, options.componentToolbarButtons)) {
			return null;
		}

		return createMarkdownEditorContentComponentActivationRequest({
			node,
			nodePos,
			viewNodeDom: contentComponentDom
		});
	} catch {
		return null;
	}
}

function getContentComponentActivationRequestFromSelection(options: {
	view: Editor['view'];
	componentToolbarButtons: ContentComponentToolbarButton[];
}): MarkdownEditorContentComponentActivationRequest | null {
	const selection = options.view.state.selection as {
		from: number;
		node?: ContentComponentLikeNode | null;
	};
	const selectedNode = selection.node ?? null;
	if (!selectedNode || !isMarkdownEditorContentComponentNode(selectedNode, options.componentToolbarButtons)) {
		return null;
	}

	try {
		return createMarkdownEditorContentComponentActivationRequest({
			node: selectedNode,
			nodePos: selection.from,
			viewNodeDom: options.view.nodeDOM(selection.from)
		});
	} catch {
		return null;
	}
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

	function syncSelectionDataAttributes() {
		const selection = editor.state.selection as {
			node?: { type?: { name?: string } } | null;
			constructor?: { name?: string };
		};
		const selectionDom = editor.view.dom as HTMLElement;

		selectionDom.dataset.tentmanSelectionKind = selection.constructor?.name ?? 'UnknownSelection';
		if (selection.node?.type?.name) {
			selectionDom.dataset.tentmanSelectedNodeType = selection.node.type.name;
			return;
		}

		delete selectionDom.dataset.tentmanSelectedNodeType;
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
			handleDOMEvents: {
				keydown(view, event) {
					if (!(event instanceof KeyboardEvent) || event.key !== 'Enter' || !isModifierClick(event)) {
						return false;
					}

					const componentToolbarButtons = options.contentComponentToolbarButtons ?? [];
					const activationRequest = getContentComponentActivationRequestFromSelection({
						view,
						componentToolbarButtons
					});
					if (!activationRequest) {
						return false;
					}

					event.preventDefault();
					(editor.view.dom as HTMLElement).dataset.tentmanLastActivationSource = 'keyboard-mod-enter';
					queueMicrotask(() => {
						runIfActive(() => {
							options.onContentComponentActivate?.(activationRequest);
						});
					});
					return true;
				},
				dblclick(view, event) {
					if (!(event instanceof MouseEvent) || isModifierClick(event)) {
						return false;
					}

					const componentToolbarButtons = options.contentComponentToolbarButtons ?? [];
					const activationRequest = getContentComponentActivationRequestFromTarget({
						view,
						target: event.target,
						componentToolbarButtons
					});
					if (!activationRequest) {
						return false;
					}

					editor.commands.setNodeSelection(activationRequest.nodePos);
					editor.view.focus();
					(editor.view.dom as HTMLElement).dataset.tentmanLastActivationSource = 'dom-double-click';
					queueMicrotask(() => {
						runIfActive(() => {
							options.onContentComponentActivate?.(activationRequest);
						});
					});
					return true;
				}
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
			handleClickOn(view, _pos, node, nodePos, event) {
				const componentToolbarButtons = options.contentComponentToolbarButtons ?? [];
				(editor.view.dom as HTMLElement).dataset.tentmanLastClickDetail = String(event.detail);

				if (isMarkdownEditorContentComponentNode(node, componentToolbarButtons) && !isModifierClick(event)) {
					editor.commands.setNodeSelection(nodePos);
					editor.view.focus();
					return true;
				}

				if (!isModifierClick(event)) {
					return false;
				}

				return openEditorHref(node.attrs.href);
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
			syncSelectionDataAttributes();
			reportUiChange();
		},
		onTransaction: () => {
			syncSelectionDataAttributes();
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
