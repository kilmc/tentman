export function uniqueStrings(values) {
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

export function getPrimaryConfigReference(config) {
	return getConfigReferences(config)[0];
}

export function getGroupReferences(group) {
	return uniqueStrings([group._tentmanId, group.slug]);
}

export function getPrimaryGroupReference(group) {
	return getGroupReferences(group)[0];
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

export function getPrimaryItemReference(item) {
	return getItemReferences(item)[0];
}

export function orderByReferences(items, orderedReferences, getReferences) {
	if (!Array.isArray(orderedReferences) || orderedReferences.length === 0) {
		return [...items];
	}

	const remainingItems = [...items];
	const orderedItems = [];

	for (const reference of orderedReferences) {
		const matchIndex = remainingItems.findIndex((item) => getReferences(item).includes(reference));
		if (matchIndex === -1) {
			continue;
		}

		const [item] = remainingItems.splice(matchIndex, 1);
		orderedItems.push(item);
	}

	return [...orderedItems, ...remainingItems];
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
