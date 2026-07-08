import { Node, type JSONContent } from '@tiptap/core';
import { createMarkdownMediaNodeView } from './media-node-view';
import {
	normalizeMarkdownMediaAttrs,
	parseMediaElementAttributes,
	renderAudioMarkdown
} from './media-node-markdown';
import type { MarkdownMediaAttrs } from './media-node-types';

interface MarkdownAudioOptions {
	assetsDir?: string;
	storagePath?: string;
}

export const MarkdownAudio = Node.create<MarkdownAudioOptions>({
	name: 'markdownAudio',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: true,

	addOptions() {
		return {
			assetsDir: undefined,
			storagePath: undefined
		};
	},

	addAttributes() {
		return {
			src: { default: null },
			title: { default: null },
			ariaLabel: { default: null },
			controls: { default: true },
			sources: { default: [] },
			tracks: { default: [] }
		};
	},

	parseHTML() {
		return [
			{
				tag: 'audio',
				getAttrs: (element) =>
					element instanceof HTMLElement ? parseMediaElementAttributes(element, 'audio') : false
			}
		];
	},

	renderHTML({ node }) {
		const attrs = normalizeMarkdownMediaAttrs(node.attrs as MarkdownMediaAttrs);
		const htmlAttrs: Record<string, string> = {};
		if (attrs.controls) {
			htmlAttrs.controls = '';
		}
		if (attrs.src) {
			htmlAttrs.src = attrs.src;
		}
		if (attrs.title) {
			htmlAttrs.title = attrs.title;
		}
		if (attrs.ariaLabel) {
			htmlAttrs['aria-label'] = attrs.ariaLabel;
		}

		return ['audio', htmlAttrs];
	},

	renderMarkdown(node: JSONContent) {
		return renderAudioMarkdown(node.attrs as MarkdownMediaAttrs);
	},

	addNodeView() {
		return (props) =>
			createMarkdownMediaNodeView(props, {
				kind: 'audio',
				assetsDir: this.options.assetsDir,
				storagePath: this.options.storagePath
			});
	}
});
