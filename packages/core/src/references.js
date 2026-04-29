function uniqueStrings(values) {
	const seen = new Set();
	const output = [];

	for (const value of values) {
		if (typeof value !== 'string' || value.length === 0 || seen.has(value)) {
			continue;
		}

		seen.add(value);
		output.push(value);
	}

	return output;
}

export function stripFileExtension(filename) {
	return filename.replace(/\.[^.]+$/, '');
}

export function getConfigReferences(config) {
	return uniqueStrings([config._tentmanId, config.id, config.slug]);
}

export function getGroupReferences(group) {
	return uniqueStrings([group._tentmanId, group.slug]);
}

export function getItemReferences(item) {
	return uniqueStrings([
		item._tentmanId,
		item.id,
		item.slug,
		item.filename,
		typeof item.filename === 'string' ? stripFileExtension(item.filename) : undefined
	]);
}

export function getConfigByReference(project) {
	const configByReference = new Map();

	for (const config of project.configs) {
		for (const reference of getConfigReferences(config)) {
			configByReference.set(reference, config);
		}
	}

	return configByReference;
}

export function getGroupByReference(groups) {
	const groupByReference = new Map();

	for (const group of groups) {
		for (const reference of getGroupReferences(group)) {
			groupByReference.set(reference, group);
		}
	}

	return groupByReference;
}

export function getItemByReference(items) {
	const itemByReference = new Map();

	for (const item of items) {
		for (const reference of getItemReferences(item)) {
			itemByReference.set(reference, item);
		}
	}

	return itemByReference;
}
