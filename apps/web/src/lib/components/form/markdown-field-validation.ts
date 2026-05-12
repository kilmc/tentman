import { getUnknownEnabledContentComponentErrors } from '$lib/content-components/availability';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import { validateMarkdownContentComponents } from '$lib/content-components/validation';

export function getMarkdownFieldValidationState(options: {
	markdown: string;
	enabledComponentNames?: string[];
	availableRegistry: ContentComponentRegistry;
	enabledRegistry: ContentComponentRegistry;
	referenceIndex?: Map<string, Map<string, unknown>>;
	referenceErrors?: string[];
}): {
	errors: string[];
	key: string;
	message: string | null;
} {
	const discoveredNames = new Set(
		options.availableRegistry.components.map((component) => component.definition.name)
	);
	const errors = Array.from(
		new Set([
			...getUnknownEnabledContentComponentErrors(options.enabledComponentNames, discoveredNames),
			...(options.referenceErrors ?? []),
			...validateMarkdownContentComponents({
				markdown: options.markdown,
				registry: options.enabledRegistry,
				availableRegistry: options.availableRegistry,
				referenceIndex: options.referenceIndex
			})
		])
	);

	return {
		errors,
		key: errors.join('\u0000'),
		message: errors.length > 0 ? errors.join(' ') : null
	};
}
