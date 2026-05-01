function assertPlainObject(value, context) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${context} must be an object`);
	}
}

function readOptionalString(value, context) {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${context} must be a non-empty string when present`);
	}

	return value;
}

function parseGroup(value, context) {
	assertPlainObject(value, context);

	if (typeof value.id !== 'string' || value.id.length === 0) {
		throw new Error(`${context}.id must be a non-empty string`);
	}

	return {
		id: value.id,
		...(readOptionalString(value.label, `${context}.label`) ? { label: value.label } : {}),
		...(readOptionalString(value.value, `${context}.value`) ? { value: value.value } : {}),
		items: Array.isArray(value.items) ? [...value.items] : []
	};
}

function parseCollection(value, context) {
	assertPlainObject(value, context);

	return {
		...(readOptionalString(value.id, `${context}.id`) ? { id: value.id } : {}),
		...(readOptionalString(value.label, `${context}.label`) ? { label: value.label } : {}),
		...(readOptionalString(value.slug, `${context}.slug`) ? { slug: value.slug } : {}),
		...(readOptionalString(value.href, `${context}.href`) ? { href: value.href } : {}),
		...(readOptionalString(value.configId, `${context}.configId`)
			? { configId: value.configId }
			: {}),
		items: Array.isArray(value.items) ? [...value.items] : [],
		...(Array.isArray(value.groups)
			? {
					groups: value.groups.map((group, index) =>
						parseGroup(group, `${context}.groups[${index}]`)
					)
				}
			: {})
	};
}

export function parseNavigationManifest(input) {
	const parsed = JSON.parse(input);
	assertPlainObject(parsed, 'navigation manifest');

	if (parsed.version !== 1) {
		throw new Error('navigation manifest version must be 1');
	}

	return {
		version: 1,
		...(parsed.content &&
		typeof parsed.content === 'object' &&
		!Array.isArray(parsed.content) &&
		Array.isArray(parsed.content.items)
			? { content: { items: [...parsed.content.items] } }
			: {}),
		...(parsed.collections &&
		typeof parsed.collections === 'object' &&
		!Array.isArray(parsed.collections)
			? {
					collections: Object.fromEntries(
						Object.entries(parsed.collections).map(([collectionId, value]) => [
							collectionId,
							parseCollection(value, `navigation manifest collections.${collectionId}`)
						])
					)
				}
			: {})
	};
}

export function getNavigationCollection(manifest, collectionReference) {
	if (!manifest?.collections || typeof collectionReference !== 'string' || collectionReference.length === 0) {
		return null;
	}

	const directMatch = manifest.collections[collectionReference];
	if (directMatch) {
		return directMatch;
	}

	for (const [key, collection] of Object.entries(manifest.collections)) {
		if (
			key === collectionReference ||
			collection.configId === collectionReference ||
			collection.id === collectionReference ||
			collection.slug === collectionReference
		) {
			return collection;
		}
	}

	return null;
}

export function getNavigationGroupDefinitions(manifest, collectionReference) {
	return [...(getNavigationCollection(manifest, collectionReference)?.groups ?? [])];
}

export function getNavigationGroupDefinition(manifest, collectionReference, groupId) {
	if (typeof groupId !== 'string' || groupId.length === 0) {
		return null;
	}

	return (
		getNavigationGroupDefinitions(manifest, collectionReference).find((group) => group.id === groupId) ??
		null
	);
}

export function getNavigationGroupLabel(manifest, collectionReference, groupId) {
	return getNavigationGroupDefinition(manifest, collectionReference, groupId)?.label ?? null;
}

export function getNavigationGroupValue(manifest, collectionReference, groupId) {
	return getNavigationGroupDefinition(manifest, collectionReference, groupId)?.value ?? null;
}
