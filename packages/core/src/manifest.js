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

export function normalizeNavigationReference(value, context = 'navigation reference') {
	if (typeof value === 'string' && value.length > 0) {
		return { id: value };
	}

	assertPlainObject(value, `${context} must be a string or object`);

	if (typeof value.id !== 'string' || value.id.length === 0) {
		throw new Error(`${context}.id must be a non-empty string`);
	}

	const label = readOptionalString(value.label, `${context}.label`);
	const slug = readOptionalString(value.slug, `${context}.slug`);
	const href = readOptionalString(value.href, `${context}.href`);

	return {
		id: value.id,
		...(label ? { label } : {}),
		...(slug ? { slug } : {}),
		...(href ? { href } : {})
	};
}

function readNavigationReferenceArray(value, context) {
	if (!Array.isArray(value)) {
		throw new Error(`${context} must be an array`);
	}

	return value.map((entry, index) => normalizeNavigationReference(entry, `${context}[${index}]`));
}

function parseNavigationManifestCollection(value, context) {
	assertPlainObject(value, `${context} must be an object`);

	const items = readNavigationReferenceArray(value.items ?? [], `${context}.items`);
	const id = readOptionalString(value.id, `${context}.id`);
	const label = readOptionalString(value.label, `${context}.label`);
	const slug = readOptionalString(value.slug, `${context}.slug`);
	const href = readOptionalString(value.href, `${context}.href`);
	const configId = readOptionalString(value.configId, `${context}.configId`);
	const groupsValue = value.groups;
	const collection = {
		...(id ? { id } : {}),
		...(label ? { label } : {}),
		...(slug ? { slug } : {}),
		...(href ? { href } : {}),
		...(configId ? { configId } : {}),
		items
	};

	if (groupsValue === undefined) {
		return collection;
	}

	if (!Array.isArray(groupsValue)) {
		throw new Error(`${context}.groups must be an array`);
	}

	return {
		...collection,
		groups: groupsValue.map((group, index) => {
			assertPlainObject(group, `${context}.groups[${index}] must be an object`);
			const groupContext = `${context}.groups[${index}]`;

			if (typeof group.id !== 'string' || group.id.length === 0) {
				throw new Error(`${groupContext}.id must be a non-empty string`);
			}

			const groupLabel = readOptionalString(group.label, `${groupContext}.label`);
			const value = readOptionalString(group.value, `${groupContext}.value`);
			const groupHref = readOptionalString(group.href, `${groupContext}.href`);

			return {
				id: group.id,
				...(groupLabel ? { label: groupLabel } : {}),
				...(value ? { value } : {}),
				...(groupHref ? { href: groupHref } : {}),
				items: readNavigationReferenceArray(group.items ?? [], `${groupContext}.items`)
			};
		})
	};
}

export function normalizeNavigationManifest(input) {
	assertPlainObject(input, 'navigation manifest must be an object');

	if (input.version !== 1) {
		throw new Error('navigation manifest version must be 1');
	}

	const manifest = { version: 1 };

	if (input.content !== undefined) {
		assertPlainObject(input.content, 'navigation manifest content must be an object');
		manifest.content = {
			items: readNavigationReferenceArray(
				input.content.items ?? [],
				'navigation manifest content.items'
			)
		};
	}

	if (input.collections !== undefined) {
		assertPlainObject(input.collections, 'navigation manifest collections must be an object');
		manifest.collections = Object.fromEntries(
			Object.entries(input.collections).map(([configId, value]) => {
				if (configId.length === 0) {
					throw new Error('navigation manifest collections key must be a non-empty string');
				}

				return [
					configId,
					parseNavigationManifestCollection(value, `navigation manifest collections.${configId}`)
				];
			})
		);
	}

	return manifest;
}

export function parseNavigationManifest(input) {
	const parsed = JSON.parse(input);
	return normalizeNavigationManifest(parsed);
}

export function serializeNavigationManifest(manifest) {
	return `${JSON.stringify(normalizeNavigationManifest(manifest), null, '\t')}\n`;
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

export function getNavigationManifestCollection(manifest, reference) {
	const referenceId = getNavigationReferenceId(reference);

	if (!manifest?.collections || typeof referenceId !== 'string' || referenceId.length === 0) {
		return null;
	}

	const directMatch = manifest.collections[referenceId];
	if (directMatch) {
		return directMatch;
	}

	for (const [key, collection] of Object.entries(manifest.collections)) {
		if (
			key === referenceId ||
			collection.id === referenceId ||
			collection.configId === referenceId ||
			collection.slug === referenceId
		) {
			return collection;
		}
	}

	return null;
}

export function getNavigationManifestGroup(collection, reference) {
	const referenceId = getNavigationReferenceId(reference);

	if (
		!Array.isArray(collection?.groups) ||
		typeof referenceId !== 'string' ||
		referenceId.length === 0
	) {
		return null;
	}

	return (
		collection.groups.find((group) => group.id === referenceId || group.value === referenceId) ??
		null
	);
}
