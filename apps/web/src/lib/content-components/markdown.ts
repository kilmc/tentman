import { Node, type Extensions } from '@tiptap/core';
import {
	normalizeContentComponentInstance,
	renderContentComponent
} from '@tentman/core/content-components';
import type { MarkdownToolbarItemContribution } from '$lib/plugins/types';
import {
	getMarkdownLabelAttributeName,
	parseDirectiveAttributes,
	serializeContentComponentDirective
} from './directives';
import type { ContentComponentRegistry } from './registry';

function toNodeName(componentName: string): string {
	return `contentComponent${componentName
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('')}`;
}

function toButtonLabel(componentName: string): string {
	return componentName
		.split('-')
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

function toFieldLabel(attributeName: string): string {
	if (attributeName === 'href' || attributeName === 'url') {
		return 'URL';
	}

	return attributeName
		.split(/[-_]/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

function buildComponentNodeView(component: ContentComponentRegistry['components'][number]) {
	return function createComponentNodeView(props: Parameters<NonNullable<ReturnType<typeof Node.create>['config']['addNodeView']>>[0]) {
		const dom = document.createElement('span');
		dom.contentEditable = 'false';
		dom.dataset.tentmanContentComponentNode = component.definition.name;

		dom.addEventListener(
			'click',
			(event) => {
				if (!event.metaKey && !event.ctrlKey) {
					return;
				}

				const href = dom.dataset.tentmanContentComponentHref?.trim();
				if (!href) {
					return;
				}

				event.preventDefault();
				window.open(href, '_blank', 'noopener');
			},
			{ capture: true }
		);

		function renderPreview(attributes: Record<string, string>) {
			dom.dataset.tentmanContentComponentHref = attributes.href ?? '';
			dom.className =
				'inline-flex max-w-full items-center rounded-xl border border-stone-300 bg-stone-50 px-2 py-1.5 text-sm text-stone-900 shadow-sm';

			try {
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: getMarkdownLabelAttributeName(component)
						? attributes[getMarkdownLabelAttributeName(component) ?? '']
						: undefined,
					attributes
				});
				dom.innerHTML = renderContentComponent(component, instance, 'preview').trim();
			} catch (error) {
				dom.className =
					'inline-flex max-w-full items-center rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 shadow-sm';
				dom.textContent =
					error instanceof Error
						? `Content component preview failed: ${error.message}`
						: 'Content component preview failed';
			}
		}

		renderPreview(props.node.attrs as Record<string, string>);

		return {
			dom,
			update(nextNode: typeof props.node) {
				if (nextNode.type.name !== props.node.type.name) {
					return false;
				}

				renderPreview(nextNode.attrs as Record<string, string>);
				return true;
			},
			ignoreMutation() {
				return true;
			}
		};
	};
}

function createContentComponentExtension(component: ContentComponentRegistry['components'][number]) {
	const nodeName = toNodeName(component.definition.name);
	const directivePrefix = `:${component.definition.name}[`;
	const labelAttributeName = getMarkdownLabelAttributeName(component);

	return Node.create({
		name: nodeName,
		priority: 1100,
		inline: true,
		group: 'inline',
		atom: true,
		selectable: true,

		addAttributes() {
			return Object.fromEntries(
				Object.entries(component.definition.attributes).map(([attributeName, definition]) => [
					attributeName,
					{
						default: definition.default ?? null,
						renderHTML: () => ({})
					}
				])
			);
		},

		parseHTML() {
			return [{ tag: `span[data-tentman-content-component-node="${component.definition.name}"]` }];
		},

		markdownTokenName: nodeName,

		markdownTokenizer: {
			name: nodeName,
			level: 'inline',
			start: (source: string) => source.indexOf(directivePrefix),
			tokenize(source: string) {
				if (!source.startsWith(directivePrefix)) {
					return undefined;
				}

				const match = source.match(
					new RegExp(
						`^:${component.definition.name.replaceAll('-', '\\-')}\\[([^\\]]*)\\](?:\\{([^}]*)\\})?`
					)
				);
				if (!match) {
					return undefined;
				}

				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: match[1],
					attributes: parseDirectiveAttributes(match[2] ?? '')
				});

				return {
					type: nodeName,
					raw: match[0],
					text: match[0],
					attrs: instance.attributes
				};
			}
		},

		parseMarkdown(token, helpers) {
			return helpers.createNode(nodeName, (token.attrs ?? {}) as Record<string, string>);
		},

		renderHTML({ HTMLAttributes }) {
			return ['span', HTMLAttributes];
		},

		renderMarkdown(node) {
			return serializeContentComponentDirective(
				component,
				(node.attrs ?? {}) as Record<string, string>
			);
		},

		addNodeView() {
			return buildComponentNodeView(component);
		}
	});
}

function createToolbarItem(
	component: ContentComponentRegistry['components'][number]
): MarkdownToolbarItemContribution {
	const nodeName = toNodeName(component.definition.name);
	const buttonLabel = toButtonLabel(component.definition.name);
	const labelAttributeName = getMarkdownLabelAttributeName(component);

	return {
		id: component.definition.id,
		label: buttonLabel,
		buttonLabel,
		isActive(editor) {
			return editor.isActive(nodeName);
		},
		dialog: {
			title: buttonLabel,
			submitLabel: `Save ${buttonLabel.toLowerCase()}`,
			fields: Object.entries(component.definition.attributes).map(([attributeName, definition]) => ({
				id: attributeName,
				label: toFieldLabel(attributeName),
				type:
					definition.type === 'enum'
						? 'select'
						: attributeName === 'href' || attributeName === 'url'
							? 'url'
							: 'text',
				required: Boolean(definition.required),
				defaultValue: definition.default ?? '',
				options:
					definition.type === 'enum'
						? (definition.options ?? []).map((option) => ({
								label: toFieldLabel(option),
								value: option
							}))
						: undefined
			})),
			getInitialValues(editor) {
				const currentAttributes = editor.isActive(nodeName) ? editor.getAttributes(nodeName) : {};

				return Object.fromEntries(
					Object.keys(component.definition.attributes).map((attributeName) => [
						attributeName,
						String(currentAttributes[attributeName] ?? component.definition.attributes[attributeName]?.default ?? '')
					])
				);
			},
			submit(editor, values) {
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: labelAttributeName ? values[labelAttributeName] ?? '' : undefined,
					attributes: values
				});

				if (editor.isActive(nodeName)) {
					editor.chain().focus().updateAttributes(nodeName, instance.attributes).run();
					return;
				}

				editor
					.chain()
					.focus()
					.insertContent({
						type: nodeName,
						attrs: instance.attributes
					})
					.run();
			}
		}
	};
}

export function createMarkdownContentComponentArtifacts(
	registry: ContentComponentRegistry
): {
	extensions: Extensions;
	toolbarItems: MarkdownToolbarItemContribution[];
} {
	const inlineComponents = registry.components.filter((component) => component.definition.kind === 'inline');

	return {
		extensions: inlineComponents.map((component) => createContentComponentExtension(component)),
		toolbarItems: inlineComponents.map((component) => createToolbarItem(component))
	};
}
