import {
	normalizeContentComponentInstance,
	renderContentComponent
} from '@tentman/core/content-components';
import { parseDirectiveAttributes } from './directives';
import type { ContentComponentRegistry } from './registry';

const INLINE_DIRECTIVE_PATTERN = /:([A-Za-z0-9][A-Za-z0-9-]*)\[([^\]]*)\](?:\{([^}]*)\})?/g;

export interface ContentComponentPreviewTransformResult {
	markdown: string;
	errors: string[];
}

function getLineAndColumn(source: string, offset: number): { line: number; column: number } {
	const preceding = source.slice(0, offset);
	const lines = preceding.split('\n');
	return {
		line: lines.length,
		column: (lines.at(-1)?.length ?? 0) + 1
	};
}

export function applyPreviewContentComponentTransforms(
	markdown: string,
	registry: ContentComponentRegistry
): ContentComponentPreviewTransformResult {
	const errors = [...registry.errors];
	const transformed = markdown.replaceAll(INLINE_DIRECTIVE_PATTERN, (raw, name, label, attributeSource, offset) => {
		const component = registry.getByName(name);
		const location = getLineAndColumn(markdown, Number(offset));

		if (!component) {
			errors.push(`Markdown preview unknown content component "${name}" at ${location.line}:${location.column}`);
			return raw;
		}

		if (component.definition.kind !== 'inline') {
			errors.push(
				`Markdown preview cannot render block content component "${name}" inline at ${location.line}:${location.column}`
			);
			return raw;
		}

		try {
			const instance = normalizeContentComponentInstance(component, {
				markdownLabel: label,
				attributes: parseDirectiveAttributes(attributeSource ?? '')
			});
			return renderContentComponent(component, instance, 'preview').trim();
		} catch (error) {
			errors.push(
				`Markdown preview failed for content component "${name}" at ${location.line}:${location.column}: ${
					error instanceof Error ? error.message : 'Unknown preview rendering error'
				}`
			);
			return raw;
		}
	});

	return {
		markdown: transformed,
		errors
	};
}
