import { describe, expect, it } from 'vitest';
import { getNextMarkdownFieldValidationState } from './markdown-field-context';
import type { ContentComponentRegistry } from '$lib/content-components/registry';

function createRegistry(): ContentComponentRegistry {
	const component = {
		directory: 'src/lib/content-components/buy-button',
		componentJsonPath: 'src/lib/content-components/buy-button/component.json',
		renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
		previewTemplatePath: 'src/lib/content-components/buy-button/preview.njk',
		renderTemplateSource: '<a>{{ label }}</a>',
		previewTemplateSource: '<span>{{ label }}</span>',
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

describe('getNextMarkdownFieldValidationState', () => {
	it('treats content component issues as warnings in permissive mode', () => {
		const registry = createRegistry();

		expect(
			getNextMarkdownFieldValidationState({
				formContentContext: null,
				markdown: ':buy-button[Broken]{href="https://example.com/buy"',
				availableRegistry: registry,
				enabledRegistry: registry,
				lastValidationErrorsKey: '',
				validationMode: 'permissive'
			})
		).toMatchObject({
			componentLoadError: expect.stringMatching(/attribute href is required/i),
			validationErrorsToEmit: null
		});
	});

	it('blocks submit for the same issues in strict mode', () => {
		const registry = createRegistry();

		expect(
			getNextMarkdownFieldValidationState({
				formContentContext: null,
				markdown: ':buy-button[Broken]{href="https://example.com/buy"',
				availableRegistry: registry,
				enabledRegistry: registry,
				lastValidationErrorsKey: '',
				validationMode: 'strict'
			})
		).toMatchObject({
			componentLoadError: expect.stringMatching(/attribute href is required/i),
			validationErrorsToEmit: [
				expect.stringMatching(/attribute href is required/i)
			]
		});
	});
});
