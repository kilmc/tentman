import { describe, expect, it } from 'vitest';
import { applyAuthoringContentComponentTransforms } from './authoring';
import type { ContentComponentRegistry } from './registry';

function createRegistry(
	overrides: Partial<ContentComponentRegistry['components'][number]> = {}
): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/buy-button',
		componentJsonPath: 'src/lib/content-components/buy-button/component.json',
		renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
		renderTemplateSource: '<a>{{ label }}</a>',
		definition: {
			id: 'buy-button',
			name: 'buy-button',
			kind: 'inline' as const,
			editor: {
				toolbarLabel: 'Buy Button'
			},
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
	} as ContentComponentRegistry['components'][number];

	return {
		components: [component],
		errors: [],
		getByName(name: string) {
			return name === component.definition.name ? component : undefined;
		}
	};
}

describe('applyAuthoringContentComponentTransforms', () => {
	it('renders inline directives as fixed app-owned content component chips', () => {
		const result = applyAuthoringContentComponentTransforms(
			':buy-button[Buy tickets]{href="/tickets"}',
			createRegistry()
		);

		expect(result.markdown).toContain('data-tentman-content-component-chip="inline"');
		expect(result.markdown).toContain('Buy Button');
		expect(result.errors).toEqual([]);
	});

	it('falls back to a humanized component name when toolbarLabel is absent', () => {
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
			}
		});

		const result = applyAuthoringContentComponentTransforms(':doc-link{href="/docs"}', registry);
		expect(result.markdown).toContain('Doc Link');
		expect(result.errors).toEqual([]);
	});

	it('renders block directives with the same fixed authoring treatment', () => {
		const registry = createRegistry({
			directory: 'src/lib/content-components/callout-box',
			componentJsonPath: 'src/lib/content-components/callout-box/component.json',
			renderTemplatePath: 'src/lib/content-components/callout-box/render.njk',
			renderTemplateSource: '<div>{{ title }}</div>',
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

		const result = applyAuthoringContentComponentTransforms(
			'::callout-box{title="Latest update"}',
			registry
		);
		expect(result.markdown).toContain('data-tentman-content-component-chip="block"');
		expect(result.markdown).toContain('Callout Box');
		expect(result.errors).toEqual([]);
	});

	it('preserves source and reports errors for invalid component instances', () => {
		const result = applyAuthoringContentComponentTransforms(
			':buy-button[Buy tickets]',
			createRegistry()
		);

		expect(result.markdown).toContain(':buy-button[Buy tickets]');
		expect(result.errors[0]).toContain('Markdown content component handling failed for "buy-button"');
	});

	it('preserves source and reports errors for malformed directive attributes', () => {
		const result = applyAuthoringContentComponentTransforms(
			':buy-button[Buy tickets]{href=/tickets}',
			createRegistry()
		);

		expect(result.markdown).toContain(':buy-button[Buy tickets]{href=/tickets}');
		expect(result.errors[0]).toContain('Could not parse directive attributes');
	});

	it('preserves source and reports errors for unknown components', () => {
		const result = applyAuthoringContentComponentTransforms(
			':missing-widget[Hello]{href="/x"}',
			createRegistry()
		);

		expect(result.markdown).toContain(':missing-widget[Hello]{href="/x"}');
		expect(result.errors[0]).toContain('Unknown markdown content component "missing-widget"');
	});

	it('still validates reference-backed instances before rendering a fixed chip', () => {
		const registry = createRegistry({
			directory: 'src/lib/content-components/gallery-embed',
			componentJsonPath: 'src/lib/content-components/gallery-embed/component.json',
			renderTemplatePath: 'src/lib/content-components/gallery-embed/render.njk',
			renderTemplateSource: '<div>{{ data.title }}</div>',
			definition: {
				id: 'gallery-embed',
				name: 'gallery-embed',
				kind: 'block',
				attributes: {
					galleryRef: {
						type: 'string',
						default: 'main',
						reference: true,
						referenceScope: 'container'
					}
				}
			}
		});

		const result = applyAuthoringContentComponentTransforms('::gallery-embed', registry, {
			contentItem: {
				body: '::gallery-embed',
				gallery: {
					referenceToken: 'main',
					title: 'Homepage gallery'
				}
			},
			referenceIndex: new Map([
				[
					'gallery-embed:galleryRef',
					new Map([
						[
							'main',
							{
								token: 'main',
								self: 'main',
								container: {
									referenceToken: 'main',
									title: 'Homepage gallery'
								},
								full: {
									body: '::gallery-embed',
									gallery: {
										referenceToken: 'main',
										title: 'Homepage gallery'
									}
								}
							}
						]
					])
				]
			])
		});

		expect(result.markdown).toContain('Gallery Embed');
		expect(result.errors).toEqual([]);
	});
});
