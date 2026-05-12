import { parseContentDirectiveMatches } from './directives';

export function getUnknownEnabledContentComponentErrors(
	enabledComponentNames: string[] | undefined,
	availableComponentNames: Set<string>,
	prefix = 'Markdown field enables'
): string[] {
	return (enabledComponentNames ?? [])
		.filter((name, index, values) => values.indexOf(name) === index)
		.filter((name) => !availableComponentNames.has(name))
		.map((name) => `${prefix} unknown content component "${name}"`);
}

export function getMarkdownContentComponentAvailabilityErrors(
	markdown: string,
	availableComponentNames: Set<string>,
	enabledComponentNames: Set<string>,
	prefix = 'Markdown field contains'
): string[] {
	const errors = new Set<string>();

	for (const match of [
		...parseContentDirectiveMatches(markdown, 'inline'),
		...parseContentDirectiveMatches(markdown, 'block')
	]) {
		if (!availableComponentNames.has(match.name)) {
			errors.add(`${prefix} unknown content component "${match.name}"`);
			continue;
		}

		if (!enabledComponentNames.has(match.name)) {
			errors.add(`${prefix} content component "${match.name}" that is not enabled on this field`);
		}
	}

	return Array.from(errors);
}
