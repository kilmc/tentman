import {
	normalizeContentComponentInstance,
	validateContentComponentInstance
} from '@tentman/core/content-components';
import { createContentComponentChipMarkup } from '$lib/content-components/label-chip';
import { parseContentDirectiveMatchesSafe } from './directives';
import type { ContentComponentRegistry } from './registry';

export interface ContentComponentAuthoringTransformResult {
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
	availableRegistry?: ContentComponentRegistry,
	options: {
		contentItem?: object | null;
		referenceIndex?: Map<string, Map<string, unknown>>;
	} = {}
): string {
	const { matches, issues } = parseContentDirectiveMatchesSafe(markdown, kind);
	if (matches.length === 0) {
		for (const issue of issues) {
			const location = getLineAndColumn(markdown, issue.offset);
			errors.push(
				`Markdown content component handling failed for "${issue.name}" at ${location.line}:${location.column}: ${issue.error}`
			);
		}
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
					? `Markdown content component "${match.name}" is not enabled on this field at ${location.line}:${location.column}`
					: `Unknown markdown content component "${match.name}" at ${location.line}:${location.column}`
			);
			transformed += match.raw;
			continue;
		}

		if (component.definition.kind !== kind) {
			errors.push(
				`Markdown cannot place ${component.definition.kind} content component "${match.name}" as ${kind} at ${location.line}:${location.column}`
			);
			transformed += match.raw;
			continue;
		}

		try {
			const instance = normalizeContentComponentInstance(component, {
				markdownLabel: match.markdownLabel,
				attributes: match.attributes
			});
			const validationErrors = validateContentComponentInstance(component, instance, {
				referenceIndex: options.referenceIndex
			});
			if (validationErrors.length > 0) {
				throw new Error(validationErrors.join(' '));
			}

			transformed += createContentComponentChipMarkup(component);
		} catch (error) {
			errors.push(
				`Markdown content component handling failed for "${match.name}" at ${location.line}:${location.column}: ${
					error instanceof Error ? error.message : 'Unknown content component handling error'
				}`
			);
			transformed += match.raw;
		}
	}

	for (const issue of issues) {
		const location = getLineAndColumn(markdown, issue.offset);
		errors.push(
			`Markdown content component handling failed for "${issue.name}" at ${location.line}:${location.column}: ${issue.error}`
		);
	}

	transformed += markdown.slice(cursor);
	return transformed;
}

export function applyAuthoringContentComponentTransforms(
	markdown: string,
	registry: ContentComponentRegistry,
	options: {
		availableRegistry?: ContentComponentRegistry;
		contentItem?: object | null;
		referenceIndex?: Map<string, Map<string, unknown>>;
	} = {}
): ContentComponentAuthoringTransformResult {
	const errors = [...registry.errors];
	let transformed = markdown;

	transformed = applyDirectiveMatches(
		transformed,
		registry,
		'block',
		errors,
		options.availableRegistry,
		options
	);
	transformed = applyDirectiveMatches(
		transformed,
		registry,
		'inline',
		errors,
		options.availableRegistry,
		options
	);

	return {
		markdown: transformed,
		errors
	};
}
