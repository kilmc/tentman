import { Node, mergeAttributes, type Extensions, type JSONContent } from '@tiptap/core';
import type { MarkdownHtmlInlineNodeContribution, UnifiedLocalPlugin } from '$lib/plugins/types';
import { createHtmlInlinePluginNodeView } from '$lib/plugins/node-view';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function renderInlineNodeToHtml(definition: MarkdownHtmlInlineNodeContribution, node: JSONContent): string {
	const rendered = definition.renderHTML((node.attrs ?? {}) as Record<string, unknown>);
	const attributes = Object.entries(rendered.attributes)
		.filter(([, value]) => value !== '')
		.map(([key, value]) => `${key}="${escapeHtml(value)}"`)
		.join(' ');
	const openTag = attributes ? `<${rendered.tag} ${attributes}>` : `<${rendered.tag}>`;

	return `${openTag}${escapeHtml(rendered.text)}</${rendered.tag}>`;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSimpleAttributeSelector(selector: string):
	| {
			tag: string;
			attribute: string;
			value: string;
	  }
	| null {
	const match = selector.match(/^([a-z0-9-]+)\[([^=\]]+)="([^"]+)"\]$/i);

	if (!match) {
		return null;
	}

	return {
		tag: match[1],
		attribute: match[2],
		value: match[3]
	};
}

function getHtmlInlineNodeMatch(
	definition: MarkdownHtmlInlineNodeContribution,
	source: string
): { raw: string; attributes: Record<string, string | null | undefined> } | null {
	const selector = parseSimpleAttributeSelector(definition.selector);

	if (!selector) {
		return null;
	}

	const openingTagMatch = source.match(new RegExp(`^<${escapeRegex(selector.tag)}\\b[^>]*>`, 'i'));
	if (!openingTagMatch) {
		return null;
	}

	const openingTag = openingTagMatch[0];
	const markerPattern = new RegExp(
		`\\s${escapeRegex(selector.attribute)}=(["'])${escapeRegex(selector.value)}\\1`,
		'i'
	);

	if (!markerPattern.test(openingTag)) {
		return null;
	}

	const closingTagMatch = source
		.slice(openingTag.length)
		.match(new RegExp(`</${escapeRegex(selector.tag)}\\s*>`, 'i'));

	if (!closingTagMatch || closingTagMatch.index === undefined) {
		return null;
	}

	const raw = source.slice(0, openingTag.length + closingTagMatch.index + closingTagMatch[0].length);
	const template = document.createElement('template');
	template.innerHTML = raw;
	const element = template.content.firstElementChild;

	if (!(element instanceof HTMLElement) || !element.matches(definition.selector)) {
		return null;
	}

	return {
		raw,
		attributes: Object.fromEntries(
			definition.attributes.map((attribute) => [attribute.name, attribute.parse(element)])
		)
	};
}

function createHtmlInlineNodeExtension(definition: MarkdownHtmlInlineNodeContribution) {
	return Node.create({
		name: definition.nodeName,
		priority: 1100,
		inline: true,
		group: 'inline',
		atom: true,
		selectable: true,

		addAttributes() {
			return Object.fromEntries(
				definition.attributes.map((attribute) => [
					attribute.name,
					{
						default: attribute.default ?? null,
						parseHTML: (element: HTMLElement) => attribute.parse(element),
						renderHTML: () => ({})
					}
				])
			);
		},

		parseHTML() {
			return [{ tag: definition.selector }];
		},

		markdownTokenName: definition.nodeName,

		markdownTokenizer: {
			name: definition.nodeName,
			level: 'inline',
			start: (source: string) => source.indexOf('<'),
			tokenize(source: string) {
				const match = getHtmlInlineNodeMatch(definition, source);

				if (!match) {
					return undefined;
				}

				return {
					type: definition.nodeName,
					raw: match.raw,
					text: match.raw,
					attrs: match.attributes
				};
			}
		},

		parseMarkdown(token, helpers) {
			return helpers.createNode(
				definition.nodeName,
				(token.attrs ?? {}) as Record<string, string | null | undefined>
			);
		},

		renderHTML({ HTMLAttributes, node }) {
			const rendered = definition.renderHTML(node.attrs as Record<string, unknown>);
			return [
				rendered.tag,
				mergeAttributes(HTMLAttributes, rendered.attributes),
				rendered.text
			];
		},

		renderMarkdown(node) {
			return renderInlineNodeToHtml(definition, node);
		},

		addNodeView() {
			return (props) => createHtmlInlinePluginNodeView(props, definition);
		}
	});
}

export function createMarkdownPluginExtensions(plugins: UnifiedLocalPlugin[]): Extensions {
	return plugins.flatMap((entry) =>
		(entry.markdown?.htmlInlineNodes ?? []).map((node) => createHtmlInlineNodeExtension(node))
	);
}
