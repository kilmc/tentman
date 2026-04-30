import { getItemByReference } from './references.js';
import { listTentmanContent } from './content-list.js';

function sanitizeItem(item) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		return item;
	}

	const { __tentmanSourceIndex, __tentmanSourcePath, ...value } = item;
	void __tentmanSourceIndex;
	void __tentmanSourcePath;
	return value;
}

export function inspectTentmanContent(project, configReference, itemReference) {
	const content = listTentmanContent(project, configReference);
	const config = project.configs.find((entry) => entry.path === content.config.path);
	const projectContent = project.contentByConfigPath.get(content.config.path);
	const items = projectContent?.items ?? [];

	if (!config) {
		throw new Error(`Unknown content config reference: ${configReference}`);
	}

	if (itemReference) {
		const item = getItemByReference(items).get(itemReference);

		if (!item) {
			throw new Error(
				`Unknown item reference for ${content.config.label}: ${itemReference}`
			);
		}

		const index = items.indexOf(item);

		return {
			config: content.config,
			item: {
				...content.items[index],
				value: sanitizeItem(item)
			}
		};
	}

	if (items.length === 1) {
		return {
			config: content.config,
			item: {
				...content.items[0],
				value: sanitizeItem(items[0])
			}
		};
	}

	throw new Error(
		`${content.config.label} has ${items.length} items; pass an item reference to inspect one`
	);
}
