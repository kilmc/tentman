import { describe, expect, it } from 'vitest';
import { validateMarkdownContentComponents } from './validation';
import type { ContentComponentRegistry } from './registry';

function createRegistry(): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/buy-button',
		componentJsonPath: 'src/lib/content-components/buy-button/component.json',
		renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
		renderTemplateSource: '<a>{{ label }}</a>',
		definition: {
			id: 'buy-button',
			name: 'buy-button',
			kind: 'inline' as const,
			attributes: {
				href: {
					type: 'string' as const,
					required: true
				},
				label: {
					type: 'string' as const,
					required: true,
					valueFromMarkdownLabel: true
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

function createBlockRegistry(): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/project-gallery',
		componentJsonPath: 'src/lib/content-components/project-gallery/component.json',
		renderTemplatePath: 'src/lib/content-components/project-gallery/render.njk',
		renderTemplateSource: '<div>{{ galleryId }}</div>',
		definition: {
			id: 'project-gallery',
			name: 'project-gallery',
			kind: 'block' as const,
			attributes: {
				galleryId: {
					type: 'string' as const,
					required: true
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

describe('validateMarkdownContentComponents', () => {
	it('reports malformed directive attributes without throwing', () => {
		expect(
			validateMarkdownContentComponents({
				markdown: ':buy-button[Buy tickets]{href=/tickets}',
				registry: createRegistry()
			})
		).toEqual([
			'Markdown field contains invalid content component "buy-button": Could not parse directive attributes: href=/tickets'
		]);
	});

	it('does not misclassify block directives as inline directives', () => {
		expect(
			validateMarkdownContentComponents({
				markdown: '::project-gallery{galleryId="city-sketches"}',
				registry: createBlockRegistry()
			})
		).toEqual([]);
	});

	it('does not treat staged draft image refs as inline content components', () => {
		expect(
			validateMarkdownContentComponents({
				markdown: '![Uploaded image](draft-asset:eadd963b-edff-455f-a404-f09bc57155fd)',
				registry: createRegistry()
			})
		).toEqual([]);
	});
});
