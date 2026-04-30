import { printTentmanNavigation } from './nav-print.js';
import { getConfigByReference } from './references.js';

function findCollectionReference(project, config) {
	return Object.keys(project.navigationManifest.manifest?.collections ?? {}).find((reference) =>
		config.path === getConfigByReference(project).get(reference)?.path
	);
}

export function explainTentmanNavigation(project, configReference, itemReference) {
	const config = getConfigByReference(project).get(configReference);

	if (!config) {
		throw new Error(`Unknown content config reference: ${configReference}`);
	}

	const topLevelNavigation = printTentmanNavigation(project);
	const topLevelIndex = topLevelNavigation.content.findIndex((entry) => entry.path === config.path);
	const manifestTopLevelItems = project.navigationManifest.manifest?.content?.items ?? [];
	const topLevelMatchedReference =
		topLevelNavigation.content[topLevelIndex]?.references.find((reference) =>
			manifestTopLevelItems.includes(reference)
		) ?? null;
	const explanation = {
		config: {
			label: config.label,
			reference: topLevelNavigation.content[topLevelIndex]?.reference ?? null,
			path: config.path,
			topLevelIndex,
			topLevelSource: topLevelMatchedReference ? 'manifest' : 'project-order',
			topLevelMatchedReference
		}
	};

	if (!itemReference) {
		return explanation;
	}

	if (!(config.collection === true || typeof config.collection === 'object')) {
		throw new Error(`${config.label} is not a collection config`);
	}

	const collectionNavigation = printTentmanNavigation(project, configReference);
	const itemIndex = collectionNavigation.items.findIndex((item) => item.references.includes(itemReference));

	if (itemIndex === -1) {
		throw new Error(`Unknown item reference for ${config.label}: ${itemReference}`);
	}

	const item = collectionNavigation.items[itemIndex];
	const groupIndex = collectionNavigation.groups.findIndex((group) =>
		group.items.some((groupItem) => groupItem.reference === item.reference)
	);
	const group = groupIndex === -1 ? null : collectionNavigation.groups[groupIndex];
	const collectionReference = findCollectionReference(project, config);
	const manifestCollectionItems = collectionReference
		? project.navigationManifest.manifest?.collections?.[collectionReference]?.items ?? []
		: [];
	const itemMatchedReference =
		item.references.find((reference) => manifestCollectionItems.includes(reference)) ?? null;

	return {
		...explanation,
		item: {
			label: item.label,
			reference: item.reference,
			path: item.path,
			index: itemIndex,
			orderSource: itemMatchedReference ? 'manifest' : 'content-source-order',
			matchedReference: itemMatchedReference,
			group: group
				? {
						id: group.id,
						label: group.label,
						index: groupIndex
					}
				: null
		}
	};
}
