import { Node, type Extensions } from '@tiptap/core';
import {
	normalizeContentComponentInstance,
	renderContentComponent
} from '@tentman/core/content-components';
import type { MarkdownToolbarItemContribution } from '$lib/features/markdown-editor/types';
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

function toButtonLabel(component: ContentComponentRegistry['components'][number]): string {
	return (
		component.definition.editor?.toolbarLabel ??
		component.definition.name
			.split('-')
			.filter(Boolean)
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ')
	);
}

function toFieldLabel(
	component: ContentComponentRegistry['components'][number],
	attributeName: string
): string {
	const editorLabel = component.definition.attributes[attributeName]?.editor?.label;
	if (editorLabel) {
		return editorLabel;
	}

	if (attributeName === 'href' || attributeName === 'url') {
		return 'URL';
	}

	return attributeName
		.split(/[-_]/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

function getFieldControl(
	component: ContentComponentRegistry['components'][number],
	attributeName: string
): 'text' | 'url' | 'select' {
	const definition = component.definition.attributes[attributeName];
	const editorControl = definition?.editor?.control;
	if (editorControl) {
		return editorControl;
	}

	if (definition?.type === 'enum') {
		return 'select';
	}

	if (attributeName === 'href' || attributeName === 'url') {
		return 'url';
	}

	return 'text';
}

function escapeForRegExp(source: string): string {
	return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDirectiveMatch(
	component: ContentComponentRegistry['components'][number],
	source: string
): RegExpMatchArray | null {
	const prefix = component.definition.kind === 'block' ? '::' : ':';
	const pattern = new RegExp(
		`^${escapeForRegExp(prefix)}${escapeForRegExp(component.definition.name)}(?:\\[([^\\]]*)\\])?(?:\\{([^}]*)\\})?`
	);

	return source.match(pattern);
}

function getDialogFieldIds(component: ContentComponentRegistry['components'][number]): string[] {
	return Object.entries(component.definition.attributes)
		.filter(([, definition]) => definition.editor?.hidden !== true)
		.map(([attributeName]) => attributeName);
}

function buildComponentNodeView(component: ContentComponentRegistry['components'][number]) {
	return function createComponentNodeView(
		props: Parameters<NonNullable<ReturnType<typeof Node.create>['config']['addNodeView']>>[0]
	) {
		const dom = document.createElement(component.definition.kind === 'block' ? 'div' : 'span');
		dom.contentEditable = 'false';
		dom.dataset.tentmanContentComponentNode = component.definition.name;
		dom.dataset.tentmanContentComponentKind = component.definition.kind;

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
				component.definition.kind === 'block'
					? 'my-3 rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 shadow-sm'
					: 'inline-flex max-w-full items-center rounded-xl border border-stone-300 bg-stone-50 px-2 py-1.5 text-sm text-stone-900 shadow-sm';

			try {
				const labelAttributeName = getMarkdownLabelAttributeName(component);
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: labelAttributeName ? attributes[labelAttributeName] : undefined,
					attributes
				});
				dom.innerHTML = renderContentComponent(component, instance, 'preview').trim();
			} catch (error) {
				dom.className =
					component.definition.kind === 'block'
						? 'my-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-sm'
						: 'inline-flex max-w-full items-center rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 shadow-sm';
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
	const directivePrefix =
		component.definition.kind === 'block'
			? `::${component.definition.name}`
			: `:${component.definition.name}`;
	const labelAttributeName = getMarkdownLabelAttributeName(component);
	const inline = component.definition.kind === 'inline';

	return Node.create({
		name: nodeName,
		priority: 1100,
		inline,
		group: inline ? 'inline' : 'block',
		atom: true,
		selectable: true,
		defining: !inline,

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
			return [
				{
					tag: `${inline ? 'span' : 'div'}[data-tentman-content-component-node="${component.definition.name}"]`
				}
			];
		},

		markdownTokenName: nodeName,

		markdownTokenizer: {
			name: nodeName,
			level: inline ? 'inline' : 'block',
			start: (source: string) => source.indexOf(directivePrefix),
			tokenize(source: string) {
				if (!source.startsWith(directivePrefix)) {
					return undefined;
				}

				const match = getDirectiveMatch(component, source);
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
			return [inline ? 'span' : 'div', HTMLAttributes];
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
	const buttonLabel = toButtonLabel(component);
	const dialogTitle = component.definition.editor?.dialogTitle ?? buttonLabel;
	const submitLabel = component.definition.editor?.submitLabel ?? `Save ${buttonLabel.toLowerCase()}`;
	const labelAttributeName = getMarkdownLabelAttributeName(component);
	const dialogFieldIds = getDialogFieldIds(component);

	return {
		id: component.definition.id,
		label: buttonLabel,
		buttonLabel,
		isActive(editor) {
			return editor.isActive(nodeName);
		},
		dialog: {
			title: dialogTitle,
			submitLabel,
			fields: dialogFieldIds.map((attributeName) => {
				const definition = component.definition.attributes[attributeName];

				return {
					id: attributeName,
					label: toFieldLabel(component, attributeName),
					type: getFieldControl(component, attributeName),
					required: Boolean(definition.required),
					defaultValue: definition.default ?? '',
					options:
						definition.type === 'enum'
							? (definition.options ?? []).map((option) => ({
									label: toFieldLabel(component, option),
									value: option
								}))
							: undefined
				};
			}),
			getInitialValues(editor) {
				const currentAttributes = editor.isActive(nodeName) ? editor.getAttributes(nodeName) : {};

				return Object.fromEntries(
					Object.keys(component.definition.attributes).map((attributeName) => [
						attributeName,
						String(
							currentAttributes[attributeName] ??
								component.definition.attributes[attributeName]?.default ??
								''
						)
					])
				);
			},
			serialize(values) {
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: labelAttributeName ? values[labelAttributeName] ?? '' : undefined,
					attributes: values
				});

				return serializeContentComponentDirective(component, instance.attributes);
			},
			validate(values) {
				try {
					normalizeContentComponentInstance(component, {
						markdownLabel: labelAttributeName ? values[labelAttributeName] ?? '' : undefined,
						attributes: values
					});
					return null;
				} catch (error) {
					return error instanceof Error ? error.message : 'Invalid content component values.';
				}
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
	return {
		extensions: registry.components.map((component) => createContentComponentExtension(component)),
		toolbarItems: registry.components.map((component) => createToolbarItem(component))
	};
}
