import fs from 'node:fs/promises';
import { isTentmanId } from './ids.js';
import { NAVIGATION_MANIFEST_PATH, serializeNavigationManifest } from './manifest.js';
import { resolveProjectPath } from './paths.js';
import {
	getConfigByReference,
	getGroupByReference,
	getItemByReference
} from './references.js';

function getStableReference(reference, referenceMap) {
	const entity = referenceMap.get(reference);

	if (!entity || !isTentmanId(entity._tentmanId)) {
		return reference;
	}

	return entity._tentmanId;
}

function mapReference(reference, referenceMap, changes, owner) {
	const nextReference = getStableReference(reference, referenceMap);

	if (nextReference !== reference) {
		changes.push({
			...owner,
			from: reference,
			to: nextReference
		});
	}

	return nextReference;
}

function refreshCollectionManifest(project, config, collectionManifest, changes) {
	const content = project.contentByConfigPath.get(config.path);
	const itemByReference = getItemByReference(content?.items ?? []);
	const groupByReference = getGroupByReference(config.groups);

	return {
		items: (collectionManifest.items ?? []).map((itemReference) =>
			mapReference(itemReference, itemByReference, changes, {
				kind: 'item',
				collection: config._tentmanId ?? config.id ?? config.slug
			})
		),
		...(collectionManifest.groups
			? {
					groups: collectionManifest.groups.map((group) => ({
						id: mapReference(group.id, groupByReference, changes, {
							kind: 'group',
							collection: config._tentmanId ?? config.id ?? config.slug
						}),
						...(group.label ? { label: group.label } : {}),
						...(group.slug ? { slug: group.slug } : {}),
						items: (group.items ?? []).map((itemReference) =>
							mapReference(itemReference, itemByReference, changes, {
								kind: 'item',
								collection: config._tentmanId ?? config.id ?? config.slug,
								group: group.id
							})
						)
					}))
				}
			: {})
	};
}

export async function refreshNavigationManifest(project) {
	if (!project.navigationManifest.exists) {
		throw new Error(`${NAVIGATION_MANIFEST_PATH} does not exist`);
	}

	if (project.navigationManifest.error || !project.navigationManifest.manifest) {
		throw new Error(
			`Could not parse ${NAVIGATION_MANIFEST_PATH}: ${
				project.navigationManifest.error ?? 'Failed to parse navigation manifest'
			}`
		);
	}

	const manifest = project.navigationManifest.manifest;
	const configByReference = getConfigByReference(project);
	const changes = [];
	const nextManifest = {
		version: 1,
		...(manifest.content
			? {
					content: {
						items: manifest.content.items.map((configReference) =>
							mapReference(configReference, configByReference, changes, { kind: 'config' })
						)
					}
				}
			: {}),
		...(manifest.collections
			? {
					collections: Object.fromEntries(
						Object.entries(manifest.collections).map(([collectionReference, collectionManifest]) => {
							const config = configByReference.get(collectionReference);
							const nextCollectionReference = mapReference(
								collectionReference,
								configByReference,
								changes,
								{ kind: 'collection' }
							);

							return [
								nextCollectionReference,
								config
									? refreshCollectionManifest(project, config, collectionManifest, changes)
									: collectionManifest
							];
						})
					)
				}
			: {})
	};
	const source = serializeNavigationManifest(manifest);
	const nextSource = serializeNavigationManifest(nextManifest);
	const changed = nextSource !== source;

	if (changed) {
		await fs.writeFile(resolveProjectPath(project.rootDir, NAVIGATION_MANIFEST_PATH), nextSource);
	}

	return {
		path: NAVIGATION_MANIFEST_PATH,
		changed,
		changes
	};
}

export function summarizeNavigationRefreshChanges(result) {
	return {
		configs: result.changes.filter((change) => change.kind === 'config').length,
		collections: result.changes.filter((change) => change.kind === 'collection').length,
		groups: result.changes.filter((change) => change.kind === 'group').length,
		items: result.changes.filter((change) => change.kind === 'item').length
	};
}
