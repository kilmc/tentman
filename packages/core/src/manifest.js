import { assertPlainObject } from './json.js';

export const NAVIGATION_MANIFEST_PATH = 'tentman/navigation-manifest.json';

function readOptionalString(value, context) {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${context} must be a non-empty string when present`);
	}

	return value;
}

function parseNavigationReference(value, context) {
	if (typeof value === 'string' && value.length > 0) {
		return { id: value };
	}

	assertPlainObject(value, `${context} must be a string or object`);

	if (typeof value.id !== 'string' || value.id.length === 0) {
		throw new Error(`${context}.id must be a non-empty string`);
	}

	return {
		id: value.id,
		...(readOptionalString(value.label, `${context}.label`) ? { label: value.label } : {}),
		...(readOptionalString(value.slug, `${context}.slug`) ? { slug: value.slug } : {}),
		...(readOptionalString(value.href, `${context}.href`) ? { href: value.href } : {})
	};
}

function readNavigationReferenceArray(value, context) {
	if (!Array.isArray(value)) {
		throw new Error(`${context} must be an array`);
	}

	return value.map((entry, index) => parseNavigationReference(entry, `${context}[${index}]`));
}

function parseNavigationManifestCollection(value, context) {
	assertPlainObject(value, `${context} must be an object`);

	const items = readNavigationReferenceArray(value.items ?? [], `${context}.items`);
	const groupsValue = value.groups;

	if (groupsValue === undefined) {
		return {
			...(readOptionalString(value.id, `${context}.id`) ? { id: value.id } : {}),
			...(readOptionalString(value.label, `${context}.label`) ? { label: value.label } : {}),
			...(readOptionalString(value.slug, `${context}.slug`) ? { slug: value.slug } : {}),
			...(readOptionalString(value.href, `${context}.href`) ? { href: value.href } : {}),
			...(readOptionalString(value.configId, `${context}.configId`)
				? { configId: value.configId }
				: {}),
			items
		};
	}

	if (!Array.isArray(groupsValue)) {
		throw new Error(`${context}.groups must be an array`);
	}

	return {
		...(readOptionalString(value.id, `${context}.id`) ? { id: value.id } : {}),
		...(readOptionalString(value.label, `${context}.label`) ? { label: value.label } : {}),
		...(readOptionalString(value.slug, `${context}.slug`) ? { slug: value.slug } : {}),
		...(readOptionalString(value.href, `${context}.href`) ? { href: value.href } : {}),
		...(readOptionalString(value.configId, `${context}.configId`)
			? { configId: value.configId }
			: {}),
		items,
		groups: groupsValue.map((group, index) => {
			assertPlainObject(group, `${context}.groups[${index}] must be an object`);

			if (typeof group.id !== 'string' || group.id.length === 0) {
				throw new Error(`${context}.groups[${index}].id must be a non-empty string`);
			}

			return {
				id: group.id,
				...(typeof group.label === 'string' && group.label.length > 0
					? { label: group.label }
					: {}),
				...(typeof group.slug === 'string' && group.slug.length > 0 ? { slug: group.slug } : {}),
				...(typeof group.href === 'string' && group.href.length > 0 ? { href: group.href } : {}),
				items: readNavigationReferenceArray(group.items ?? [], `${context}.groups[${index}].items`)
			};
		})
	};
}

export function parseNavigationManifest(input) {
	const parsed = JSON.parse(input);
	assertPlainObject(parsed, 'navigation manifest must be an object');

	if (parsed.version !== 1) {
		throw new Error('navigation manifest version must be 1');
	}

	const manifest = { version: 1 };

	if (parsed.content !== undefined) {
		assertPlainObject(parsed.content, 'navigation manifest content must be an object');
		manifest.content = {
			items: readNavigationReferenceArray(parsed.content.items ?? [], 'navigation manifest content.items')
		};
	}

	if (parsed.collections !== undefined) {
		assertPlainObject(parsed.collections, 'navigation manifest collections must be an object');
		manifest.collections = Object.fromEntries(
			Object.entries(parsed.collections).map(([configId, value]) => [
				configId,
				parseNavigationManifestCollection(value, `navigation manifest collections.${configId}`)
			])
		);
	}

	return manifest;
}

export function serializeNavigationManifest(manifest) {
	return `${JSON.stringify(manifest, null, '\t')}\n`;
}

export function getNavigationReferenceId(reference) {
	return typeof reference === 'string' ? reference : reference?.id;
}

export function getNavigationReferenceIds(references) {
	return Array.isArray(references)
		? references
				.map((reference) => getNavigationReferenceId(reference))
				.filter((reference) => typeof reference === 'string' && reference.length > 0)
		: [];
}
