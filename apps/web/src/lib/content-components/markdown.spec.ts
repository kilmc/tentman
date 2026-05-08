import { describe, expect, it } from 'vitest';
import { createMarkdownContentComponentArtifacts } from './markdown';
import type { ContentComponentRegistry } from './registry';
import { serializeContentComponentDirective } from './directives';

function createRegistry(): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/buy-button',
		componentJsonPath: 'src/lib/content-components/buy-button/component.json',
		renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
		previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
		renderTemplateSource:
			'<a class="buy-button buy-button--{{ variant }}" href="{{ href | escape }}">{{ label | escape }}</a>',
		previewTemplateSource:
			'<a class="tm-component-preview tm-component-preview--buy-button" href="{{ href | escape }}">Buy button: {{ label | escape }}</a>',
		definition: {
			id: 'buy-button',
			name: 'buy-button',
			kind: 'inline' as const,
			editor: {
				toolbarLabel: 'Buy Button',
				dialogTitle: 'Buy button',
				submitLabel: 'Save buy button'
			},
			attributes: {
				href: {
					type: 'string' as const,
					required: true,
					editor: {
						label: 'URL',
						control: 'url'
					}
				},
				label: {
					type: 'string' as const,
					required: true,
					default: 'Buy online',
					valueFromMarkdownLabel: true
				},
				variant: {
					type: 'enum' as const,
					default: 'default',
					options: ['default', 'secondary']
				}
			}
		}
	};

	return {
		components: [component],
		errors: [],
		getByName(name: string) {
			return name === component.definition.name ? component : undefined;
		}
	};
}

function createEditorDouble(active = false, attributes: Record<string, string> = {}) {
	const commands: Array<{ type: 'update' | 'insert'; payload: unknown }> = [];
	const chainApi = {
		focus() {
			return chainApi;
		},
		updateAttributes(nodeName: string, nextAttributes: Record<string, string>) {
			commands.push({
				type: 'update',
				payload: {
					nodeName,
					attrs: nextAttributes
				}
			});
			return chainApi;
		},
		insertContent(payload: unknown) {
			commands.push({
				type: 'insert',
				payload
			});
			return chainApi;
		},
		run() {
			return true;
		}
	};

	return {
		editor: {
			isActive(nodeName: string) {
				return active && nodeName === 'contentComponentBuyButton';
			},
			getAttributes(nodeName: string) {
				return nodeName === 'contentComponentBuyButton' ? attributes : {};
			},
			chain() {
				return chainApi;
			}
		},
		commands
	};
}

describe('createMarkdownContentComponentArtifacts', () => {
	it('lists inline components with generated form fields', () => {
		const artifacts = createMarkdownContentComponentArtifacts(createRegistry());
		const toolbarItem = artifacts.toolbarItems[0];

		expect(artifacts.extensions).toHaveLength(1);
		expect(toolbarItem).toMatchObject({
			id: 'buy-button',
			label: 'Buy Button',
			buttonLabel: 'Buy Button'
		});
		expect(toolbarItem.dialog?.title).toBe('Buy button');
		expect(toolbarItem.dialog?.submitLabel).toBe('Save buy button');
		expect(toolbarItem.dialog?.fields).toEqual([
			{
				id: 'href',
				label: 'URL',
				type: 'url',
				required: true,
				defaultValue: '',
				options: undefined
			},
			{
				id: 'label',
				label: 'Label',
				type: 'text',
				required: true,
				defaultValue: 'Buy online',
				options: undefined
			},
			{
				id: 'variant',
				label: 'Variant',
				type: 'select',
				required: false,
				defaultValue: 'default',
				options: [
					{ label: 'Default', value: 'default' },
					{ label: 'Secondary', value: 'secondary' }
				]
			}
		]);
	});

	it('serializes semantic markdown markers from normalized attributes', () => {
		const component = createRegistry().components[0];

		expect(
			serializeContentComponentDirective(component, {
				href: 'https://example.com/tickets',
				label: 'Buy tickets',
				variant: 'secondary'
			})
		).toBe(':buy-button[Buy tickets]{href="https://example.com/tickets" variant="secondary"}');
	});

	it('omits empty markdown labels for label-less inline components', () => {
		const component = {
			...createRegistry().components[0],
			definition: {
				...createRegistry().components[0].definition,
				id: 'doc-link',
				name: 'doc-link',
				attributes: {
					href: {
						type: 'string' as const,
						required: true
					}
				}
			}
		};

		expect(
			serializeContentComponentDirective(component, {
				href: '/docs'
			})
		).toBe(':doc-link{href="/docs"}');
	});

	it('hydrates existing node attributes into editable values', () => {
		const artifacts = createMarkdownContentComponentArtifacts(createRegistry());
		const toolbarItem = artifacts.toolbarItems[0];
		const { editor } = createEditorDouble(true, {
			href: 'https://example.com/old',
			label: 'Old label',
			variant: 'default'
		});

		expect(toolbarItem.isActive?.(editor as never)).toBe(true);
		expect(toolbarItem.dialog?.getInitialValues?.(editor as never)).toEqual({
			href: 'https://example.com/old',
			label: 'Old label',
			variant: 'default'
		});
	});

	it('serializes dialog values back into semantic markdown markers', () => {
		const artifacts = createMarkdownContentComponentArtifacts(createRegistry());
		const toolbarItem = artifacts.toolbarItems[0];

		expect(
			toolbarItem.dialog?.serialize?.({
				href: 'https://example.com/tickets',
				label: 'Buy tickets',
				variant: 'secondary'
			})
		).toBe(':buy-button[Buy tickets]{href="https://example.com/tickets" variant="secondary"}');
	});

	it('validates dialog values through the shared content component normalizer', () => {
		const artifacts = createMarkdownContentComponentArtifacts(createRegistry());
		const toolbarItem = artifacts.toolbarItems[0];

		expect(
			toolbarItem.dialog?.validate?.({
				href: 'https://example.com/tickets',
				label: 'Buy tickets',
				variant: 'secondary'
			})
		).toBeNull();
		expect(
			toolbarItem.dialog?.validate?.({
				href: 'https://example.com/tickets',
				label: 'Buy tickets',
				variant: 'loud'
			})
		).toBe('Content component attribute variant must be one of: default, secondary');
	});

	it('updates existing nodes and inserts new nodes through the generated dialog contract', () => {
		const artifacts = createMarkdownContentComponentArtifacts(createRegistry());
		const toolbarItem = artifacts.toolbarItems[0];
		const existing = createEditorDouble(true, {
			href: 'https://example.com/old',
			label: 'Old label',
			variant: 'default'
		});
		const inserted = createEditorDouble(false);

		toolbarItem.dialog?.submit(existing.editor as never, {
			href: 'https://example.com/new',
			label: 'New label',
			variant: 'secondary'
		});
		toolbarItem.dialog?.submit(inserted.editor as never, {
			href: 'https://example.com/new',
			label: 'New label',
			variant: 'secondary'
		});

		expect(existing.commands).toEqual([
			{
				type: 'update',
				payload: {
					nodeName: 'contentComponentBuyButton',
					attrs: {
						href: 'https://example.com/new',
						label: 'New label',
						variant: 'secondary'
					}
				}
			}
		]);
		expect(inserted.commands).toEqual([
			{
				type: 'insert',
				payload: {
					type: 'contentComponentBuyButton',
					attrs: {
						href: 'https://example.com/new',
						label: 'New label',
						variant: 'secondary'
					}
				}
			}
		]);
	});
});
