import { listTentmanContent } from './content-list.js';
import {
	getNavigationManifestCollectionEntry,
	getNavigationManifestCollectionItems,
	getNavigationManifestContentItems,
	getNavigationManifestGroupItems,
	getNavigationManifestGroups,
	getNavigationReferenceIds
} from './manifest.js';
import {
	getConfigByReference,
	getConfigReferences,
	orderByReferences
} from './references.js';

function orderConfigs(project, entries) {
	const manifestIds = getNavigationReferenceIds(
		getNavigationManifestContentItems(project.navigationManifest.manifest)
	);
	return orderByReferences(entries, manifestIds, (entry) => entry.references);
}

function orderCollectionItems(project, config, items) {
	const manifestCollection =
		getConfigReferences(config)
			.map((reference) =>
				getNavigationManifestCollectionEntry(project.navigationManifest.manifest, reference)
			)
			.find(Boolean)?.collection ?? null;

	return {
		items: orderByReferences(
			items,
			getNavigationReferenceIds(getNavigationManifestCollectionItems(manifestCollection)),
			(item) => item.references
		),
		manifestCollection
	};
}

function summarizeGroupItems(group, items) {
	const groupItemIds = getNavigationReferenceIds(getNavigationManifestGroupItems(group));
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
	const groups = getNavigationManifestGroups(manifestCollection).map((group) => ({
		id: group.id,
		label: group.label ?? group.id,
		value: group.value ?? null,
		items: summarizeGroupItems(group, items)
	}));

	return {
		config: content.config,
		items,
		groups
	};
}
