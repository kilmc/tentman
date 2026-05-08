import { describe, expect, it } from 'vitest';
import { applyPreviewContentComponentTransforms } from './preview';
import type { ContentComponentRegistry } from './registry';

function createRegistry(overrides: Partial<ContentComponentRegistry['components'][number]> = {}): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/buy-button',
		componentJsonPath: 'src/lib/content-components/buy-button/component.json',
		renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
		previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
		renderTemplateSource: '<a>{{ label }}</a>',
		previewTemplateSource:
			'<span class="tm-component-preview tm-component-preview--buy-button">Buy button: {{ label | escape }}</span>',
		definition: {
			id: 'buy-button',
			name: 'buy-button',
			kind: 'inline' as const,
			attributes: {
				href: {
					type: 'string',
					required: true,
					valueFromMarkdownLabel: false
				},
				label: {
					type: 'string',
					required: true,
					valueFromMarkdownLabel: true
				}
			}
		},
		...overrides
	};

	return {
		components: [component],
		errors: [],
		getByName(name: string) {
			return name === component.definition.name ? component : undefined;
		}
	};
}

describe('applyPreviewContentComponentTransforms', () => {
	it('renders inline directives through preview templates', () => {
		const result = applyPreviewContentComponentTransforms(
			':buy-button[Buy tickets]{href="/tickets"}',
			createRegistry()
		);

		expect(result.markdown).toContain('Buy button: Buy tickets');
		expect(result.errors).toEqual([]);
	});

	it('renders label-less inline directives through preview templates', () => {
		const registry = createRegistry({
			definition: {
				id: 'doc-link',
				name: 'doc-link',
				kind: 'inline',
				attributes: {
					href: {
						type: 'string',
						required: true
					}
				}
			},
			previewTemplateSource: '<span>Doc link: {{ href | escape }}</span>'
		});

		const result = applyPreviewContentComponentTransforms(':doc-link{href="/docs"}', registry);
		expect(result.markdown).toContain('Doc link: /docs');
		expect(result.errors).toEqual([]);
	});

	it('renders block directives through preview templates', () => {
		const registry = createRegistry({
			directory: 'src/lib/content-components/callout-box',
			componentJsonPath: 'src/lib/content-components/callout-box/component.json',
			renderTemplatePath: 'src/lib/content-components/callout-box/render.njk',
			previewTemplatePath: 'src/lib/content-components/callout-box/preview.njk',
			previewTemplateSource: '<aside>Callout: {{ title | escape }}</aside>',
			definition: {
				id: 'callout-box',
				name: 'callout-box',
				kind: 'block',
				attributes: {
					title: {
						type: 'string',
						required: true
					}
				}
			}
		});

		const result = applyPreviewContentComponentTransforms('::callout-box{title="Latest update"}', registry);
		expect(result.markdown).toContain('Callout: Latest update');
		expect(result.errors).toEqual([]);
	});

	it('preserves source and reports errors for invalid component instances', () => {
		const result = applyPreviewContentComponentTransforms(
			':buy-button[Buy tickets]',
			createRegistry()
		);

		expect(result.markdown).toContain(':buy-button[Buy tickets]');
		expect(result.errors[0]).toContain('Markdown preview failed for content component "buy-button"');
	});

	it('preserves source and reports errors for unknown components', () => {
		const result = applyPreviewContentComponentTransforms(
			':missing-widget[Hello]{href="/x"}',
			createRegistry()
		);

		expect(result.markdown).toContain(':missing-widget[Hello]{href="/x"}');
		expect(result.errors[0]).toContain('Markdown preview unknown content component "missing-widget"');
	});
});
