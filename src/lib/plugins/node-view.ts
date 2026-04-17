import type { NodeViewRendererProps } from '@tiptap/core';
import type { MarkdownHtmlInlineNodeContribution } from '$lib/plugins/types';

function resolveClassName(
	definition: MarkdownHtmlInlineNodeContribution,
	attributes: Record<string, unknown>
): string | undefined {
	if (!definition.editorView.className) {
		return undefined;
	}

	return typeof definition.editorView.className === 'function'
		? definition.editorView.className(attributes)
		: definition.editorView.className;
}

export function createHtmlInlinePluginNodeView(
	props: NodeViewRendererProps,
	definition: MarkdownHtmlInlineNodeContribution
) {
	const dom = document.createElement('span');
	dom.contentEditable = 'false';

	function render(nodeAttributes: Record<string, unknown>) {
		dom.className =
			'inline-flex max-w-full items-center rounded-full border border-stone-300 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900 shadow-sm';

		const pluginClassName = resolveClassName(definition, nodeAttributes);
		if (pluginClassName) {
			dom.className = `${dom.className} ${pluginClassName}`;
		}

		dom.textContent = definition.editorView.label(nodeAttributes);
	}

	render(props.node.attrs as Record<string, unknown>);

	return {
		dom,
		update(nextNode: NodeViewRendererProps['node']) {
			if (nextNode.type.name !== props.node.type.name) {
				return false;
			}

			render(nextNode.attrs as Record<string, unknown>);
			return true;
		},
		ignoreMutation() {
			return true;
		}
	};
}
