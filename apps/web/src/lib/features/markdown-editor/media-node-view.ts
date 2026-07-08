import type { NodeViewRendererProps } from '@tiptap/core';
import { mount, unmount, type Component } from 'svelte';
import RichEditorAudio from './RichEditorAudio.svelte';
import RichEditorVideo from './RichEditorVideo.svelte';
import type { MarkdownMediaAttrs, MarkdownMediaKind } from './media-node-types';

interface CreateMarkdownMediaNodeViewOptions {
	kind: MarkdownMediaKind;
	assetsDir?: string;
	storagePath?: string;
}

interface MarkdownMediaNodeViewComponentProps {
	attrs: MarkdownMediaAttrs;
	assetsDir?: string;
	storagePath?: string;
}

function getMediaComponent(
	kind: MarkdownMediaKind
): Component<MarkdownMediaNodeViewComponentProps> {
	return kind === 'audio' ? RichEditorAudio : RichEditorVideo;
}

export function createMarkdownMediaNodeView(
	props: NodeViewRendererProps,
	options: CreateMarkdownMediaNodeViewOptions
) {
	const dom = document.createElement('div');
	dom.className = `markdown-editor-${options.kind}-node`;
	dom.contentEditable = 'false';

	let currentProps = props;
	let app = render(currentProps);

	function render(nextProps: NodeViewRendererProps) {
		dom.replaceChildren();
		const Component = getMediaComponent(options.kind);

		return mount(Component, {
			target: dom,
			props: {
				attrs: nextProps.node.attrs,
				assetsDir: options.assetsDir,
				storagePath: options.storagePath
			}
		});
	}

	return {
		dom,
		update(nextNode: NodeViewRendererProps['node']) {
			if (nextNode.type.name !== currentProps.node.type.name) {
				return false;
			}

			void unmount(app);
			currentProps = {
				...currentProps,
				node: nextNode
			};
			app = render(currentProps);

			return true;
		},
		ignoreMutation() {
			return true;
		},
		destroy() {
			void unmount(app);
		}
	};
}
