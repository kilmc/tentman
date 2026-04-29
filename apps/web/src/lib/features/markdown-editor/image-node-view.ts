import type { NodeViewRendererProps } from '@tiptap/core';
import { mount, unmount } from 'svelte';
import RichEditorImage from './RichEditorImage.svelte';

interface CreateMarkdownImageNodeViewOptions {
	assetsDir?: string;
	storagePath?: string;
}

export function createMarkdownImageNodeView(
	props: NodeViewRendererProps,
	options: CreateMarkdownImageNodeViewOptions = {}
) {
	const dom = document.createElement('div');
	dom.className = 'markdown-editor-image-node';
	dom.contentEditable = 'false';

	let currentProps = props;
	let app = render(currentProps);

	function render(nextProps: NodeViewRendererProps) {
		dom.replaceChildren();

		return mount(RichEditorImage, {
			target: dom,
			props: {
				src: String(nextProps.node.attrs.src ?? ''),
				alt: typeof nextProps.node.attrs.alt === 'string' ? nextProps.node.attrs.alt : undefined,
				title:
					typeof nextProps.node.attrs.title === 'string' ? nextProps.node.attrs.title : undefined,
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
			app = render({
				...currentProps
			});

			return true;
		},
		ignoreMutation() {
			// This is a leaf node view rendered entirely by Svelte. ProseMirror
			// should not try to reconcile internal DOM changes from image loads or remounts.
			return true;
		},
		destroy() {
			void unmount(app);
		}
	};
}
