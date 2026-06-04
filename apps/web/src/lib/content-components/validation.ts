import {
	normalizeContentComponentInstance,
	validateContentComponentInstance
} from '@tentman/core/content-components';
import { getMarkdownContentComponentAvailabilityErrors } from './availability';
import { parseContentDirectiveMatchesSafe } from './directives';
import type { ContentComponentRegistry } from './registry';

export function validateMarkdownContentComponents(options: {
	markdown: string;
	registry: ContentComponentRegistry;
	availableRegistry?: ContentComponentRegistry;
	referenceIndex?: Map<string, Map<string, unknown>>;
}): string[] {
	const errors = new Set<string>();
	const availableComponentNames = new Set(
		(options.availableRegistry ?? options.registry).components.map(
			(component) => component.definition.name
		)
	);
	const enabledComponentNames = new Set(
		options.registry.components.map((component) => component.definition.name)
	);

	for (const message of options.registry.errors) {
		errors.add(message);
	}

	for (const message of getMarkdownContentComponentAvailabilityErrors(
		options.markdown,
		availableComponentNames,
		enabledComponentNames
	)) {
		errors.add(message);
	}

	for (const kind of ['block', 'inline'] as const) {
		const { matches, issues } = parseContentDirectiveMatchesSafe(options.markdown, kind);

		for (const issue of issues) {
			errors.add(
				`Markdown field contains invalid content component "${issue.name}": ${issue.error}`
			);
		}

		for (const match of matches) {
			const component = options.registry.getByName(match.name);
			if (!component) {
				const availableComponent = options.availableRegistry?.getByName(match.name);
				errors.add(
					availableComponent
						? `Markdown field contains content component "${match.name}" that is not enabled on this field`
						: `Markdown field contains unknown content component "${match.name}"`
				);
				continue;
			}

			if (component.definition.kind !== kind) {
				errors.add(
					`Markdown field uses ${component.definition.kind} content component "${match.name}" as ${kind}`
				);
				continue;
			}

			try {
				const instance = normalizeContentComponentInstance(component, {
					markdownLabel: match.markdownLabel,
					attributes: match.attributes
				});
				for (const message of validateContentComponentInstance(component, instance, {
					referenceIndex: options.referenceIndex
				})) {
					errors.add(
						`Markdown field contains invalid content component "${match.name}": ${message}`
					);
				}
			} catch (error) {
				errors.add(
					`Markdown field contains invalid content component "${match.name}": ${
						error instanceof Error ? error.message : 'Unknown validation error'
					}`
				);
			}
		}
	}

	return Array.from(errors);
}
