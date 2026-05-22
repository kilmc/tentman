import { Node, type Extensions, type NodeViewRendererProps } from '@tiptap/core';
import {
	getContentComponentReferenceAttribute,
	normalizeContentComponentInstance,
	renderContentComponent,
	validateContentComponentInstance
} from '@tentman/core/content-components';
import type { MarkdownToolbarItemContribution } from '$lib/features/markdown-editor/types';
import {
	getMarkdownLabelAttributeName,
	parseDirectiveAttributes,
	serializeContentComponentDirective
} from './directives';
import type { ContentComponentRegistry } from './registry';
import { mountSafePreviewHost, sanitizeRenderedPreviewHtml } from './safe-preview';

const BROKEN_ATTRIBUTE_NAME = '__tentmanBroken';
const BROKEN_ERROR_ATTRIBUTE_NAME = '__tentmanBrokenError';
const RAW_ATTRIBUTE_NAME = '__tentmanRaw';

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

function getDirectivePrefix(component: ContentComponentRegistry['components'][number]): string {
	return component.definition.kind === 'block'
		? `::${component.definition.name}`
		: `:${component.definition.name}`;
}

function getDialogFieldIds(component: ContentComponentRegistry['components'][number]): string[] {
	return Object.entries(component.definition.attributes)
		.filter(([, definition]) => definition.editor?.hidden !== true)
		.map(([attributeName]) => attributeName);
}

function getReferenceAttributeBinding(
	component: ContentComponentRegistry['components'][number],
	attributeName: string
): string | undefined {
	const referenceAttribute = getContentComponentReferenceAttribute(component);
	return referenceAttribute?.attributeId === attributeName ? referenceAttribute.binding : undefined;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function getSchemaAttributes(
	component: ContentComponentRegistry['components'][number],
	attributes: Record<string, unknown>
): Record<string, string> {
	return Object.fromEntries(
		Object.keys(component.definition.attributes).map((attributeName) => [
			attributeName,
			String(attributes[attributeName] ?? '')
		])
	);
}

function getBrokenDirectiveState(attributes: Record<string, unknown>): {
	broken: boolean;
	error: string;
	raw: string;
} {
	return {
		broken: String(attributes[BROKEN_ATTRIBUTE_NAME] ?? '') === 'true',
		error: String(attributes[BROKEN_ERROR_ATTRIBUTE_NAME] ?? ''),
		raw: String(attributes[RAW_ATTRIBUTE_NAME] ?? '')
	};
}

function getRecoverableDirectiveEnd(
	source: string,
	kind: ContentComponentRegistry['components'][number]['definition']['kind']
): number {
	if (kind === 'block') {
		const newlineIndex = source.indexOf('\n');
		return newlineIndex === -1 ? source.length : newlineIndex;
	}

	let quote: '"' | "'" | null = null;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];

		if (quote) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === '[') {
			bracketDepth += 1;
			continue;
		}

		if (character === ']') {
			bracketDepth = Math.max(0, bracketDepth - 1);
			continue;
		}

		if (character === '{') {
			braceDepth += 1;
			continue;
		}

		if (character === '}') {
			braceDepth = Math.max(0, braceDepth - 1);
			continue;
		}

		if (index > 0 && /\s/.test(character) && bracketDepth === 0 && braceDepth === 0) {
			return index;
		}
	}

	return source.length;
}

function recoverDirectiveAttributes(source: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const pattern = /([A-Za-z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

	for (const match of source.matchAll(pattern)) {
		attributes[match[1]] = match[3] ?? match[4] ?? '';
	}

	return attributes;
}

function parseRecoverableDirective(
	component: ContentComponentRegistry['components'][number],
	source: string
): {
	raw: string;
	markdownLabel?: string;
	attributes: Record<string, string>;
	error: string | null;
} | null {
	const prefix = getDirectivePrefix(component);
	if (!source.startsWith(prefix)) {
		return null;
	}

	const strictMatch = getDirectiveMatch(component, source);
	if (!strictMatch) {
		return null;
	}

	const recoverableEnd = getRecoverableDirectiveEnd(source, component.definition.kind);
	const raw =
		recoverableEnd > strictMatch[0].length ? source.slice(0, recoverableEnd) : strictMatch[0];
	let cursor = prefix.length;
	let markdownLabel: string | undefined;
	let attributes: Record<string, string> = {};
	let error: string | null = null;

	if (raw[cursor] === '[') {
		const labelEnd = raw.indexOf(']', cursor + 1);
		if (labelEnd === -1) {
			markdownLabel = raw.slice(cursor + 1);
			error = 'Could not parse directive label.';
			return { raw, markdownLabel, attributes, error };
		}

		markdownLabel = raw.slice(cursor + 1, labelEnd);
		cursor = labelEnd + 1;
	}

	if (raw[cursor] === '{') {
		const hasClosingBrace = raw.endsWith('}');
		const attributeSource = hasClosingBrace ? raw.slice(cursor + 1, -1) : raw.slice(cursor + 1);
		try {
			attributes = parseDirectiveAttributes(attributeSource);
		} catch (parseError) {
			attributes = recoverDirectiveAttributes(attributeSource);
			error =
				parseError instanceof Error
					? parseError.message
					: `Could not parse directive attributes: ${attributeSource}`;
		}

		if (!hasClosingBrace) {
			error = error ?? `Could not parse directive attributes: ${attributeSource}`;
		}

		cursor = raw.length;
	}

	const trailing = raw.slice(cursor).trim();
	if (trailing.length > 0) {
		error = error ?? `Could not parse directive attributes: ${trailing}`;
	}

	return {
		raw,
		markdownLabel,
		attributes,
		error
	};
}

function buildComponentNodeView(
	component: ContentComponentRegistry['components'][number],
	options: {
		getPreviewRenderOptions?: () => {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		};
	} = {}
) {
	return function createComponentNodeView(props: NodeViewRendererProps) {
		const dom = document.createElement(component.definition.kind === 'block' ? 'div' : 'span');
		dom.contentEditable = 'false';
		dom.dataset.tentmanContentComponentNode = component.definition.name;
		dom.dataset.tentmanContentComponentKind = component.definition.kind;

		function renderPreview(attributes: Record<string, string>) {
			const brokenState = getBrokenDirectiveState(attributes);
			const componentAttributes = getSchemaAttributes(component, attributes);

			dom.dataset.tentmanContentComponentHref = componentAttributes.href ?? '';
			dom.dataset.tentmanContentComponentBroken = brokenState.broken ? 'true' : 'false';
			dom.className =
				component.definition.kind === 'block'
					? 'relative my-3 overflow-hidden rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 shadow-sm'
					: 'relative inline-flex max-w-full items-center overflow-hidden rounded-xl border border-stone-300 bg-stone-50 px-2 py-1.5 text-sm text-stone-900 shadow-sm';

			try {
				const labelAttributeName = getMarkdownLabelAttributeName(component);
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: labelAttributeName ? componentAttributes[labelAttributeName] : undefined,
					attributes: componentAttributes
				});
				const previewRenderOptions = options.getPreviewRenderOptions?.();
				const validationErrors = validateContentComponentInstance(component, instance, {
					referenceIndex: previewRenderOptions?.referenceIndex ?? new Map()
				});
				if (validationErrors.length > 0) {
					throw new Error(validationErrors.join(' '));
				}

				if (brokenState.broken) {
					throw new Error(brokenState.error || 'Content component marker needs repair.');
				}

				const previewHtml = renderContentComponent(component, instance, 'preview', {
					contentItem: previewRenderOptions?.contentItem ?? null,
					referenceIndex: previewRenderOptions?.referenceIndex ?? new Map()
				}).trim();
				const sanitizedPreview = sanitizeRenderedPreviewHtml(previewHtml);
				mountSafePreviewHost(dom, {
					html: sanitizedPreview.html,
					kind: component.definition.kind
				});
			} catch (error) {
				dom.dataset.tentmanContentComponentBroken = 'true';
				dom.className =
					component.definition.kind === 'block'
						? 'relative my-3 overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-sm'
						: 'relative inline-flex max-w-full items-center overflow-hidden rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 shadow-sm';
				const message = error instanceof Error ? error.message : 'Content component preview failed';
				dom.innerHTML =
					component.definition.kind === 'block'
						? `<div class="grid gap-2"><p class="text-xs font-semibold tracking-[0.14em] uppercase text-red-600">Invalid ${escapeHtml(component.definition.name)}</p><p class="font-medium">${escapeHtml(message)}</p></div>`
						: `<span class="font-medium">${escapeHtml(message)}</span>`;
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

function createContentComponentExtension(
	component: ContentComponentRegistry['components'][number],
	options: {
		getPreviewRenderOptions?: () => {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		};
	} = {}
) {
	const nodeName = toNodeName(component.definition.name);
	const directivePrefix = getDirectivePrefix(component);
	const labelAttributeName = getMarkdownLabelAttributeName(component);
	const inline = component.definition.kind === 'inline';

	return Node.create({
		name: nodeName,
		inline,
		group: inline ? 'inline' : 'block',
		atom: true,
		selectable: true,

		addAttributes() {
			return {
				...Object.fromEntries(
					Object.entries(component.definition.attributes).map(([attributeName, definition]) => [
						attributeName,
						{
							default: definition.default ?? null,
							renderHTML: () => ({})
						}
					])
				),
				[BROKEN_ATTRIBUTE_NAME]: {
					default: 'false',
					renderHTML: () => ({})
				},
				[BROKEN_ERROR_ATTRIBUTE_NAME]: {
					default: '',
					renderHTML: () => ({})
				},
				[RAW_ATTRIBUTE_NAME]: {
					default: '',
					renderHTML: () => ({})
				}
			};
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

				const recoverableDirective = parseRecoverableDirective(component, source);
				if (!recoverableDirective) {
					return undefined;
				}

				let instance;
				try {
					instance = normalizeContentComponentInstance(component, {
						markdownLabel: recoverableDirective.markdownLabel,
						attributes: recoverableDirective.attributes
					});
				} catch (error) {
					const recoveredAttributes = getSchemaAttributes(
						component,
						recoverableDirective.attributes
					);
					if (labelAttributeName) {
						recoveredAttributes[labelAttributeName] = recoverableDirective.markdownLabel ?? '';
					}

					return {
						type: nodeName,
						raw: recoverableDirective.raw,
						text: recoverableDirective.raw,
						attrs: {
							...recoveredAttributes,
							[BROKEN_ATTRIBUTE_NAME]: 'true',
							[BROKEN_ERROR_ATTRIBUTE_NAME]:
								recoverableDirective.error ??
								(error instanceof Error ? error.message : 'Content component marker needs repair.'),
							[RAW_ATTRIBUTE_NAME]: recoverableDirective.raw
						}
					};
				}

				return {
					type: nodeName,
					raw: recoverableDirective.raw,
					text: recoverableDirective.raw,
					attrs: {
						...instance.attributes,
						[BROKEN_ATTRIBUTE_NAME]: recoverableDirective.error ? 'true' : 'false',
						[BROKEN_ERROR_ATTRIBUTE_NAME]: recoverableDirective.error ?? '',
						[RAW_ATTRIBUTE_NAME]: recoverableDirective.error ? recoverableDirective.raw : ''
					}
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
			const attributes = (node.attrs ?? {}) as Record<string, string>;
			const brokenState = getBrokenDirectiveState(attributes);
			if (brokenState.broken && brokenState.raw) {
				return brokenState.raw;
			}

			return serializeContentComponentDirective(
				component,
				getSchemaAttributes(component, attributes)
			);
		},

		addNodeView() {
			return buildComponentNodeView(component, options);
		}
	});
}

function createToolbarItem(
	component: ContentComponentRegistry['components'][number],
	options: {
		resolveReferenceOptions?: (input: {
			component: ContentComponentRegistry['components'][number];
			attributeName: string;
			binding: string;
		}) => Array<{ label: string; value: string }>;
	} = {}
): MarkdownToolbarItemContribution {
	const nodeName = toNodeName(component.definition.name);
	const buttonLabel = toButtonLabel(component);
	const dialogTitle = component.definition.editor?.dialogTitle ?? buttonLabel;
	const submitLabel =
		component.definition.editor?.submitLabel ?? `Save ${buttonLabel.toLowerCase()}`;
	const labelAttributeName = getMarkdownLabelAttributeName(component);
	const dialogFieldIds = getDialogFieldIds(component);
	const referenceAttribute = getContentComponentReferenceAttribute(component);

	return {
		id: component.definition.id,
		label: buttonLabel,
		buttonLabel,
		contentComponent: {
			nodeName,
			componentName: component.definition.name,
			hasEditableFields: dialogFieldIds.length > 0,
			reference: {
				attributeId: referenceAttribute?.attributeId ?? null,
				binding: referenceAttribute?.binding ?? component.definition.id
			}
		},
		isActive(editor) {
			return editor.isActive(nodeName);
		},
		dialog: {
			title: dialogTitle,
			submitLabel,
			fields: dialogFieldIds.map((attributeName) => {
				const definition = component.definition.attributes[attributeName];
				const referenceBinding = getReferenceAttributeBinding(component, attributeName);

				return {
					id: attributeName,
					label: toFieldLabel(component, attributeName),
					type: referenceBinding ? 'select' : getFieldControl(component, attributeName),
					required: Boolean(definition.required),
					defaultValue: definition.default ?? '',
					referenceBinding,
					options: referenceBinding
						? undefined
						: definition.type === 'enum'
							? (definition.options ?? []).map((option) => ({
									label: toFieldLabel(component, option),
									value: option
								}))
							: undefined,
					getOptions: referenceBinding
						? () =>
								options.resolveReferenceOptions?.({
									component,
									attributeName,
									binding: referenceBinding
								}) ?? []
						: undefined
				};
			}),
			getInitialValues(editor) {
				const currentAttributes = editor.isActive(nodeName) ? editor.getAttributes(nodeName) : {};
				const currentComponentAttributes = getSchemaAttributes(component, currentAttributes);

				return Object.fromEntries(
					Object.keys(component.definition.attributes).map((attributeName) => [
						attributeName,
						String(
							currentComponentAttributes[attributeName] ??
								component.definition.attributes[attributeName]?.default ??
								''
						)
					])
				);
			},
			serialize(values) {
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: labelAttributeName ? (values[labelAttributeName] ?? '') : undefined,
					attributes: values
				});

				return serializeContentComponentDirective(component, instance.attributes);
			},
			validate(values) {
				try {
					normalizeContentComponentInstance(component, {
						markdownLabel: labelAttributeName ? (values[labelAttributeName] ?? '') : undefined,
						attributes: values
					});
					return null;
				} catch (error) {
					return error instanceof Error ? error.message : 'Invalid content component values.';
				}
			},
			submit(editor, values) {
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: labelAttributeName ? (values[labelAttributeName] ?? '') : undefined,
					attributes: values
				});
				const cleanAttributes = {
					...instance.attributes,
					[BROKEN_ATTRIBUTE_NAME]: 'false',
					[BROKEN_ERROR_ATTRIBUTE_NAME]: '',
					[RAW_ATTRIBUTE_NAME]: ''
				};

				if (editor.isActive(nodeName)) {
					editor.chain().focus().updateAttributes(nodeName, cleanAttributes).run();
					return;
				}

				editor
					.chain()
					.focus()
					.insertContent({
						type: nodeName,
						attrs: cleanAttributes
					})
					.run();
			}
		}
	};
}

export function createMarkdownContentComponentArtifacts(
	registry: ContentComponentRegistry,
	options: {
		getPreviewRenderOptions?: () => {
			contentItem?: object | null;
			referenceIndex?: Map<string, Map<string, unknown>>;
		};
		resolveReferenceOptions?: (input: {
			component: ContentComponentRegistry['components'][number];
			attributeName: string;
			binding: string;
		}) => Array<{ label: string; value: string }>;
	} = {}
): {
	extensions: Extensions;
	toolbarItems: MarkdownToolbarItemContribution[];
} {
	return {
		extensions: registry.components.map((component) =>
			createContentComponentExtension(component, options)
		),
		toolbarItems: registry.components.map((component) => createToolbarItem(component, options))
	};
}
