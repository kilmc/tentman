import { assertPlainObject } from './json.js';

export const NAVIGATION_MANIFEST_PATH = 'tentman/navigation-manifest.json';

function readStringArray(value, context) {
	if (!Array.isArray(value)) {
		throw new Error(`${context} must be an array of strings`);
	}

	return value.map((entry, index) => {
		if (typeof entry !== 'string' || entry.length === 0) {
			throw new Error(`${context}[${index}] must be a non-empty string`);
		}

		return entry;
	});
}

function parseNavigationManifestCollection(value, context) {
	assertPlainObject(value, `${context} must be an object`);

	const items = readStringArray(value.items ?? [], `${context}.items`);
	const groupsValue = value.groups;

	if (groupsValue === undefined) {
		return { items };
	}

	if (!Array.isArray(groupsValue)) {
		throw new Error(`${context}.groups must be an array`);
	}

	return {
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
				items: readStringArray(group.items ?? [], `${context}.groups[${index}].items`)
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
			items: readStringArray(parsed.content.items ?? [], 'navigation manifest content.items')
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
