import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import FileHandler from '@tiptap/extension-file-handler';
import { Markdown } from '@tiptap/markdown';
import { createMarkdownImageNodeView } from './image-node-view';
import { MarkdownAudio } from './audio-extension';
import { MarkdownVideo } from './video-extension';
import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';
import type { AssetPickerKind } from '$lib/features/assets/asset-picker';
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
	insertImageValue(value: string, position?: number): void;
	insertAudioValue(value: string, position?: number): void;
	insertVideoValue(value: string, position?: number): void;
	insertFileLinkValue(input: { href: string; label: string }, position?: number): void;
	insertAssetValue(
		input: { kind: AssetPickerKind; value: string; label?: string },
		position?: number
	): void;
	getDocumentFingerprint(): string;
	getMarkdownDocumentFingerprint(markdown: string): string;
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

function createAudioNode(ref: string): JSONContent {
	return {
		type: 'markdownAudio',
		attrs: {
			src: ref,
			controls: true,
			sources: [],
			tracks: []
		}
	};
}

function createVideoNode(ref: string): JSONContent {
	return {
		type: 'markdownVideo',
		attrs: {
			src: ref,
			controls: true,
			sources: [],
			tracks: []
		}
	};
}

function createFileLinkNode(input: { href: string; label: string }): JSONContent {
	return {
		type: 'paragraph',
		content: [
			{
				type: 'text',
				text: input.label || input.href,
				marks: [
					{
						type: 'link',
						attrs: {
							href: input.href
						}
					}
				]
			}
		]
	};
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Failed to stage image';
}

function isModifierClick(event: MouseEvent | KeyboardEvent): boolean {
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
	if (
		!(contentComponentDom instanceof Element) ||
		!options.view.dom.contains(contentComponentDom)
	) {
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
	if (
		!selectedNode ||
		!isMarkdownEditorContentComponentNode(selectedNode, options.componentToolbarButtons)
	) {
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

function isBlankParagraphContent(node: JSONContent): boolean {
	if (node.type === 'text') {
		return (node.text ?? '').replace(/\u00a0/g, '').trim() === '';
	}

	return node.type === 'hardBreak';
}

function isBlankParagraph(node: JSONContent): boolean {
	return (
		node.type === 'paragraph' &&
		(!node.content || node.content.every((child) => isBlankParagraphContent(child)))
	);
}

function normalizeMarkdownDocument(content: JSONContent): JSONContent {
	if (content.type !== 'doc' || !content.content) {
		return content;
	}

	const normalizedContent = [...content.content];
	while (
		normalizedContent.length > 0 &&
		isBlankParagraph(normalizedContent.at(-1) as JSONContent)
	) {
		normalizedContent.pop();
	}

	return {
		...content,
		content: normalizedContent
	};
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

	function getMarkdownDocumentFingerprint(markdown: string): string {
		const markdownManager = editor.markdown;
		return JSON.stringify(
			markdownManager ? normalizeMarkdownDocument(markdownManager.parse(markdown)) : markdown
		);
	}

	function getEditorDocumentFingerprint(): string {
		return JSON.stringify(normalizeMarkdownDocument(editor.state.doc.toJSON()));
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
					if (
						!(event instanceof KeyboardEvent) ||
						event.key !== 'Enter' ||
						!isModifierClick(event)
					) {
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
					(editor.view.dom as HTMLElement).dataset.tentmanLastActivationSource =
						'keyboard-mod-enter';
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

				if (
					isMarkdownEditorContentComponentNode(node, componentToolbarButtons) &&
					!isModifierClick(event)
				) {
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
			MarkdownAudio.configure({
				assetsDir: options.assetsDir,
				storagePath: options.storagePath
			}),
			MarkdownVideo.configure({
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
			if (syncingFromOutside) {
				return;
			}
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
	lastKnownMarkdown = editor.getMarkdown();

	function insertJsonContent(content: JSONContent, position?: number): void {
		if (typeof position === 'number') {
			editor.chain().focus().insertContentAt(position, content).run();
			return;
		}

		const selection = editor.state.selection as { node?: unknown; to: number };
		if (selection.node) {
			editor.chain().focus().insertContentAt(selection.to, content).run();
			return;
		}

		editor.chain().focus().insertContent(content).run();
	}

	async function insertImageFiles(files: File[], position?: number): Promise<void> {
		for (const [index, file] of files.entries()) {
			const staged = await options.stageImage(file);
			if (destroyed) {
				return;
			}

			const targetPosition = index === 0 ? position : undefined;
			insertJsonContent(createImageNode(staged.ref), targetPosition);
		}
	}

	function insertImageValue(value: string, position?: number): void {
		if (destroyed || !value.trim()) {
			return;
		}

		insertJsonContent(createImageNode(value), position);
	}

	function insertAudioValue(value: string, position?: number): void {
		if (destroyed || !value.trim()) {
			return;
		}

		insertJsonContent(createAudioNode(value), position);
	}

	function insertVideoValue(value: string, position?: number): void {
		if (destroyed || !value.trim()) {
			return;
		}

		insertJsonContent(createVideoNode(value), position);
	}

	function insertFileLinkValue(input: { href: string; label: string }, position?: number): void {
		if (destroyed || !input.href.trim()) {
			return;
		}

		insertJsonContent(createFileLinkNode(input), position);
	}

	function insertAssetValue(
		input: { kind: AssetPickerKind; value: string; label?: string },
		position?: number
	): void {
		switch (input.kind) {
			case 'image':
				insertImageValue(input.value, position);
				return;
			case 'audio':
				insertAudioValue(input.value, position);
				return;
			case 'video':
				insertVideoValue(input.value, position);
				return;
			case 'file':
				insertFileLinkValue(
					{
						href: input.value,
						label: input.label?.trim() || input.value
					},
					position
				);
				return;
		}
	}

	return {
		editor,
		insertImageFiles,
		insertImageValue,
		insertAudioValue,
		insertVideoValue,
		insertFileLinkValue,
		insertAssetValue,
		getDocumentFingerprint() {
			return getEditorDocumentFingerprint();
		},
		getMarkdownDocumentFingerprint(markdown: string) {
			return getMarkdownDocumentFingerprint(markdown);
		},
		setMarkdown(markdown: string) {
			if (destroyed || markdown === lastKnownMarkdown) {
				return;
			}

			const previousMarkdown = editor.getMarkdown();
			syncingFromOutside = true;
			try {
				editor.commands.setContent(markdown, {
					contentType: 'markdown'
				});
				lastKnownMarkdown = editor.getMarkdown();
			} finally {
				syncingFromOutside = false;
			}
			if (lastKnownMarkdown !== previousMarkdown) {
				reportUiChange();
			}
		},
		destroy() {
			destroyed = true;
			editor.destroy();
		}
	};
}
