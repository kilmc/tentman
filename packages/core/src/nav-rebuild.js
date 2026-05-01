import fs from 'node:fs/promises';
import { NAVIGATION_MANIFEST_PATH, serializeNavigationManifest } from './manifest.js';
import { resolveProjectPath } from './paths.js';
import {
	getGroupByReference,
	getPrimaryConfigReference,
	getPrimaryGroupReference,
	getPrimaryItemReference
} from './references.js';

function buildConfigManifestEntry(config, reference) {
	return {
		id: reference,
		label: config.label,
		...(config.slug ? { slug: config.slug } : {})
	};
}

function buildItemManifestEntry(item, reference) {
	const label = item.title ?? item.label ?? item.slug ?? item.filename ?? reference;
	const slug =
		typeof item.slug === 'string' && item.slug.length > 0
			? item.slug
			: typeof item.filename === 'string' && item.filename.length > 0
				? item.filename.replace(/\.[^.]+$/, '')
				: undefined;

	return {
		id: reference,
		label,
		...(slug ? { slug } : {})
	};
}

function findNavigationGroupField(config) {
	const blocks = Array.isArray(config.raw.blocks) ? config.raw.blocks : [];
	const matchingBlocks = blocks.filter(
		(block) =>
			block &&
			typeof block === 'object' &&
			!Array.isArray(block) &&
			typeof block.id === 'string' &&
			block.type === 'select' &&
			block.options &&
			typeof block.options === 'object' &&
			!Array.isArray(block.options) &&
			block.options.source === 'tentman.navigationGroups'
	);

	return matchingBlocks.length === 1 ? matchingBlocks[0].id : null;
}

function rebuildCollectionManifest(project, config) {
	const content = project.contentByConfigPath.get(config.path);
	const items = content?.items ?? [];
	const groupField = findNavigationGroupField(config);
	const groupByReference = getGroupByReference(config.groups);
	const groupsById = new Map();
	const ungroupedItems = [];

	for (const group of config.groups) {
		const groupReference = getPrimaryGroupReference(group);
		if (!groupReference) {
			continue;
		}

		groupsById.set(groupReference, {
			id: groupReference,
			label: group.label,
			...(group.slug ? { slug: group.slug } : {}),
			items: []
		});
	}

	for (const item of items) {
		const itemReference = getPrimaryItemReference(item);
		if (!itemReference) {
			continue;
		}

		const groupValue = groupField ? item[groupField] : undefined;
		const group = typeof groupValue === 'string' ? groupByReference.get(groupValue) : undefined;
		const groupReference = group ? getPrimaryGroupReference(group) : undefined;
		const manifestEntry = buildItemManifestEntry(item, itemReference);

		if (groupReference && groupsById.has(groupReference)) {
			groupsById.get(groupReference).items.push(manifestEntry);
			continue;
		}

		ungroupedItems.push(manifestEntry);
	}

	const groups = [...groupsById.values()];
	const collectionReference = getPrimaryConfigReference(config);

	return {
		...(collectionReference ? buildConfigManifestEntry(config, collectionReference) : {}),
		...(typeof config.id === 'string' && config.id.length > 0 ? { configId: config.id } : {}),
		items: [...groups.flatMap((group) => group.items), ...ungroupedItems],
		...(groups.length > 0 ? { groups } : {})
	};
}

export async function rebuildNavigationManifest(project) {
	const collections = {};
	const contentItems = [];

	for (const config of project.configs) {
		const configReference = getPrimaryConfigReference(config);
		if (!configReference) {
			continue;
		}

		contentItems.push(buildConfigManifestEntry(config, configReference));

		if (config.collection === true || typeof config.collection === 'object') {
			collections[configReference] = rebuildCollectionManifest(project, config);
		}
	}

	const manifest = {
		version: 1,
		content: {
			items: contentItems
		},
		...(Object.keys(collections).length > 0 ? { collections } : {})
	};
	const source = project.navigationManifest.manifest
		? serializeNavigationManifest(project.navigationManifest.manifest)
		: null;
	const nextSource = serializeNavigationManifest(manifest);
	const changed = source !== nextSource;

	if (changed) {
		await fs.writeFile(resolveProjectPath(project.rootDir, NAVIGATION_MANIFEST_PATH), nextSource);
	}

	return {
		path: NAVIGATION_MANIFEST_PATH,
		changed,
		manifest
	};
}
