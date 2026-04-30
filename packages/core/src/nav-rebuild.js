import fs from 'node:fs/promises';
import { NAVIGATION_MANIFEST_PATH, serializeNavigationManifest } from './manifest.js';
import { resolveProjectPath } from './paths.js';
import {
	getGroupByReference,
	getPrimaryConfigReference,
	getPrimaryGroupReference,
	getPrimaryItemReference
} from './references.js';

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

		if (groupReference && groupsById.has(groupReference)) {
			groupsById.get(groupReference).items.push(itemReference);
			continue;
		}

		ungroupedItems.push(itemReference);
	}

	const groups = [...groupsById.values()];

	return {
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

		contentItems.push(configReference);

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
