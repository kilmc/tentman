import {
	normalizeContentComponentInstance,
	renderContentComponent
} from '@tentman/core/content-components';
import { parseContentDirectiveMatches } from './directives';
import type { ContentComponentRegistry } from './registry';

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

function applyDirectiveMatches(
	markdown: string,
	registry: ContentComponentRegistry,
	kind: 'inline' | 'block',
	errors: string[],
	availableRegistry?: ContentComponentRegistry
): string {
	const matches = parseContentDirectiveMatches(markdown, kind);
	if (matches.length === 0) {
		return markdown;
	}

	let cursor = 0;
	let transformed = '';

	for (const match of matches) {
		transformed += markdown.slice(cursor, match.offset);
		cursor = match.offset + match.raw.length;

		const component = registry.getByName(match.name);
		const location = getLineAndColumn(markdown, match.offset);

		if (!component) {
			const unavailableComponent = availableRegistry?.getByName(match.name);
			errors.push(
				unavailableComponent
					? `Markdown preview content component "${match.name}" is not enabled on this markdown field at ${location.line}:${location.column}`
					: `Markdown preview unknown content component "${match.name}" at ${location.line}:${location.column}`
			);
			transformed += match.raw;
			continue;
		}

		if (component.definition.kind !== kind) {
			errors.push(
				`Markdown preview cannot render ${component.definition.kind} content component "${match.name}" as ${kind} at ${location.line}:${location.column}`
			);
			transformed += match.raw;
			continue;
		}

		try {
			const instance = normalizeContentComponentInstance(component, {
				markdownLabel: match.markdownLabel,
				attributes: match.attributes
			});
			transformed += renderContentComponent(component, instance, 'preview').trim();
		} catch (error) {
			errors.push(
				`Markdown preview failed for content component "${match.name}" at ${location.line}:${location.column}: ${
					error instanceof Error ? error.message : 'Unknown preview rendering error'
				}`
			);
			transformed += match.raw;
		}
	}

	transformed += markdown.slice(cursor);
	return transformed;
}

export function applyPreviewContentComponentTransforms(
	markdown: string,
	registry: ContentComponentRegistry,
	options: {
		availableRegistry?: ContentComponentRegistry;
	} = {}
): ContentComponentPreviewTransformResult {
	const errors = [...registry.errors];
	let transformed = markdown;

	transformed = applyDirectiveMatches(
		transformed,
		registry,
		'block',
		errors,
		options.availableRegistry
	);
	transformed = applyDirectiveMatches(
		transformed,
		registry,
		'inline',
		errors,
		options.availableRegistry
	);

	return {
		markdown: transformed,
		errors
	};
}
