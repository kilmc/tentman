import { listTentmanContent } from './content-list.js';
import { getNavigationReferenceIds } from './manifest.js';
import {
	getConfigByReference,
	getConfigReferences,
	getItemReferences,
	orderByReferences
} from './references.js';

function orderConfigs(project, entries) {
	const manifestIds = getNavigationReferenceIds(project.navigationManifest.manifest?.content?.items);
	return orderByReferences(entries, manifestIds, (entry) => entry.references);
}

function orderCollectionItems(project, config, items) {
	const configReference = getConfigReferences(config).find((reference) =>
		Object.hasOwn(project.navigationManifest.manifest?.collections ?? {}, reference)
	);
	const manifestCollection = configReference
		? project.navigationManifest.manifest?.collections?.[configReference]
		: undefined;

	return {
		items: orderByReferences(
			items,
			getNavigationReferenceIds(manifestCollection?.items),
			(item) => item.references
		),
		manifestCollection
	};
}

function summarizeGroupItems(group, items) {
	const groupItemIds = getNavigationReferenceIds(group.items);
	return orderByReferences(items, groupItemIds, (item) => item.references).filter((item) =>
		item.references.some((reference) => groupItemIds.includes(reference))
	);
}

export function printTentmanNavigation(project, configReference) {
	if (!configReference) {
		const content = listTentmanContent(project);
		const orderedContent = orderConfigs(project, content);

		return {
			content: orderedContent,
			collections: orderedContent.filter((entry) => entry.kind === 'collection').map((entry) => ({
				label: entry.label,
				reference: entry.reference,
				path: entry.path,
				itemCount: entry.itemCount
			}))
		};
	}

	const config = getConfigByReference(project).get(configReference);

	if (!config) {
		throw new Error(`Unknown content config reference: ${configReference}`);
	}

	if (!(config.collection === true || typeof config.collection === 'object')) {
		throw new Error(`${config.label} is not a collection config`);
	}

	const content = listTentmanContent(project, configReference);
	const { items, manifestCollection } = orderCollectionItems(project, config, content.items);
	const groups = (manifestCollection?.groups ?? []).map((group) => ({
		id: group.id,
		label: group.label ?? group.id,
		slug: group.slug ?? null,
		items: summarizeGroupItems(group, items)
	}));

	return {
		config: content.config,
		items,
		groups
	};
}
