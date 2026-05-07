import type { ContentComponentRegistry } from './registry';

const ATTRIBUTE_PATTERN = /([A-Za-z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseDirectiveAttributes(source: string): Record<string, string> {
	ATTRIBUTE_PATTERN.lastIndex = 0;
	const attributes: Record<string, string> = {};
	let lastIndex = 0;
	let match = ATTRIBUTE_PATTERN.exec(source);

	while (match) {
		if (match.index !== lastIndex && source.slice(lastIndex, match.index).trim().length > 0) {
			throw new Error(`Could not parse directive attributes: ${source}`);
		}

		attributes[match[1]] = match[3] ?? match[4] ?? '';
		lastIndex = match.index + match[0].length;
		match = ATTRIBUTE_PATTERN.exec(source);
	}

	if (source.slice(lastIndex).trim().length > 0) {
		throw new Error(`Could not parse directive attributes: ${source}`);
	}

	return attributes;
}

function quoteDirectiveAttributeValue(value: string): string {
	if (!value.includes('"')) {
		return `"${value}"`;
	}

	if (!value.includes("'")) {
		return `'${value}'`;
	}

	return `"${value.replaceAll('"', '&quot;')}"`;
}

export function getMarkdownLabelAttributeName(
	component: ContentComponentRegistry['components'][number]
): string | null {
	for (const [attributeName, definition] of Object.entries(component.definition.attributes)) {
		if (definition?.valueFromMarkdownLabel) {
			return attributeName;
		}
	}

	return null;
}

export function serializeContentComponentDirective(
	component: ContentComponentRegistry['components'][number],
	attributes: Record<string, string>
): string {
	const labelAttributeName = getMarkdownLabelAttributeName(component);
	const label = labelAttributeName ? (attributes[labelAttributeName] ?? '') : '';
	const attributeEntries = Object.entries(attributes).filter(
		([attributeName, attributeValue]) => attributeName !== labelAttributeName && attributeValue !== ''
	);
	const serializedAttributes =
		attributeEntries.length > 0
			? `{${attributeEntries
					.map(
						([attributeName, attributeValue]) =>
							`${attributeName}=${quoteDirectiveAttributeValue(attributeValue)}`
					)
					.join(' ')}}`
			: '';

	return `:${component.definition.name}[${label}]${serializedAttributes}`;
}
