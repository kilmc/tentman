import path from 'node:path';
import { describeTentmanId } from './ids.js';
import { resolveConfigRelativePath } from './paths.js';
import { NAVIGATION_MANIFEST_PATH } from './manifest.js';
import {
	getConfigByReference,
	getGroupReferences,
	getItemByReference
} from './references.js';

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

function addIdentityDiagnostic(diagnostics, owner, id, seenIds) {
	const status = describeTentmanId(id);

	if (status === 'missing') {
		diagnostics.push(
			createDiagnostic('error', 'id.missing', `${owner.label} is missing _tentmanId`, owner)
		);
		return;
	}

	if (status === 'legacy-or-malformed') {
		diagnostics.push(
			createDiagnostic(
				'warning',
				'id.legacy',
				`${owner.label} has a legacy or malformed _tentmanId: ${id}`,
				{ ...owner, id }
			)
		);
	}

	const existing = seenIds.get(id);
	if (existing) {
		diagnostics.push(
			createDiagnostic('error', 'id.duplicate', `${owner.label} duplicates _tentmanId ${id}`, {
				...owner,
				id,
				duplicateOf: existing
			})
		);
		return;
	}

	seenIds.set(id, owner.label);
}

export function checkTentmanIds(project) {
	const diagnostics = [];
	const seenIds = new Map();

	for (const config of project.configs) {
		const isCollection = config.collection === true || typeof config.collection === 'object';

		addIdentityDiagnostic(
			diagnostics,
			{
				kind: 'config',
				label: `Config ${config.label}`,
				path: config.path
			},
			config._tentmanId,
			seenIds
		);

		for (const [index, group] of config.groups.entries()) {
			addIdentityDiagnostic(
				diagnostics,
				{
					kind: 'group',
					label: `Group ${group.label}`,
					path: config.path,
					index
				},
				group._tentmanId,
				seenIds
			);
		}

		if (!isCollection) {
			continue;
		}

		const content = project.contentByConfigPath.get(config.path);
		for (const [index, item] of (content?.items ?? []).entries()) {
			addIdentityDiagnostic(
				diagnostics,
				{
					kind: 'item',
					label: `Item ${item.title ?? item.label ?? item.slug ?? index + 1}`,
					path: content?.path ?? config.path,
					index
				},
				item._tentmanId,
				seenIds
			);
		}
	}

	return diagnostics;
}

function checkNavigationManifestReferences(project) {
	const manifest = project.navigationManifest.manifest;
	const diagnostics = [];

	if (!manifest) {
		return diagnostics;
	}

	const configByReference = getConfigByReference(project);

	for (const configReference of manifest.content?.items ?? []) {
		if (!configByReference.has(configReference)) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'manifest.stale-config-reference',
					`Navigation manifest references unknown content config: ${configReference}`,
					{ path: NAVIGATION_MANIFEST_PATH }
				)
			);
		}
	}

	for (const [collectionReference, collectionManifest] of Object.entries(manifest.collections ?? {})) {
		const config = configByReference.get(collectionReference);
		if (!config) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'manifest.stale-collection-reference',
					`Navigation manifest references unknown collection: ${collectionReference}`,
					{ path: NAVIGATION_MANIFEST_PATH }
				)
			);
			continue;
		}

		const content = project.contentByConfigPath.get(config.path);
		const itemByReference = getItemByReference(content?.items ?? []);
		const itemReferences = new Set(itemByReference.keys());
		const groupReferences = new Set(config.groups.flatMap((group) => getGroupReferences(group)));

		for (const itemReference of collectionManifest.items ?? []) {
			if (!itemReferences.has(itemReference)) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'manifest.stale-item-reference',
						`Navigation manifest references unknown ${config.label} item: ${itemReference}`,
						{ path: NAVIGATION_MANIFEST_PATH }
					)
				);
			}
		}

		for (const group of collectionManifest.groups ?? []) {
			if (groupReferences.size > 0 && !groupReferences.has(group.id)) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'manifest.stale-group-reference',
						`Navigation manifest references unknown ${config.label} group: ${group.id}`,
						{ path: NAVIGATION_MANIFEST_PATH }
					)
				);
			}

			for (const itemReference of group.items ?? []) {
				if (!itemReferences.has(itemReference)) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'manifest.stale-item-reference',
							`Navigation manifest group ${group.id} references unknown ${config.label} item: ${itemReference}`,
							{ path: NAVIGATION_MANIFEST_PATH }
						)
					);
				}
			}
		}
	}

	return diagnostics;
}

function addLegacyReferenceDiagnostic(diagnostics, owner, reference, stableId) {
	if (!stableId || reference === stableId) {
		return;
	}

	diagnostics.push(
		createDiagnostic(
			'warning',
			'manifest.legacy-reference',
			`${owner.label} uses legacy manifest reference ${reference}; stable id is ${stableId}`,
			{
				...owner,
				path: NAVIGATION_MANIFEST_PATH,
				reference,
				stableId
			}
		)
	);
}

function checkNavigationManifestLegacyReferences(project) {
	const manifest = project.navigationManifest.manifest;
	const diagnostics = [];
	const seenLegacyReferences = new Set();

	if (!manifest) {
		return diagnostics;
	}

	const configByReference = getConfigByReference(project);

	for (const configReference of manifest.content?.items ?? []) {
		const config = configByReference.get(configReference);
		if (!config) {
			continue;
		}

		addLegacyReferenceDiagnostic(
			diagnostics,
			{ kind: 'config', label: `Config ${config.label}` },
			configReference,
			config._tentmanId
		);
	}

	for (const [collectionReference, collectionManifest] of Object.entries(manifest.collections ?? {})) {
		const config = configByReference.get(collectionReference);
		if (!config) {
			continue;
		}

		addLegacyReferenceDiagnostic(
			diagnostics,
			{ kind: 'collection', label: `Collection ${config.label}` },
			collectionReference,
			config._tentmanId
		);

		const content = project.contentByConfigPath.get(config.path);
		const itemByReference = getItemByReference(content?.items ?? []);

		for (const itemReference of [
			...(collectionManifest.items ?? []),
			...(collectionManifest.groups?.flatMap((group) => group.items ?? []) ?? [])
		]) {
			const item = itemByReference.get(itemReference);
			const key = `${collectionReference}:${itemReference}`;

			if (!item || seenLegacyReferences.has(key)) {
				continue;
			}

			seenLegacyReferences.add(key);
			addLegacyReferenceDiagnostic(
				diagnostics,
				{ kind: 'item', label: `Item ${item.title ?? item.label ?? item.slug ?? itemReference}` },
				itemReference,
				item._tentmanId
			);
		}
	}

	return diagnostics;
}

export function checkNavigationManifest(project) {
	const diagnostics = [];

	if (!project.navigationManifest.exists) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'manifest.missing',
				`${NAVIGATION_MANIFEST_PATH} does not exist`,
				{ path: NAVIGATION_MANIFEST_PATH }
			)
		);
		return diagnostics;
	}

	if (project.navigationManifest.error) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'manifest.invalid',
				`Could not parse ${NAVIGATION_MANIFEST_PATH}: ${project.navigationManifest.error}`,
				{ path: NAVIGATION_MANIFEST_PATH }
			)
		);
		return diagnostics;
	}

	diagnostics.push(...checkNavigationManifestReferences(project));
	diagnostics.push(...checkNavigationManifestLegacyReferences(project));

	return diagnostics;
}

export async function doctorTentmanProject(project) {
	const diagnostics = [];

	if (project.configs.length === 0) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'config.none',
				`No content config files found in ${project.configsDir}`
			)
		);
	}

	for (const config of project.configs) {
		const contentPath = resolveConfigRelativePath(project.rootDir, config.path, config.content.path);
		const content = project.contentByConfigPath.get(config.path);

		if (!content?.exists) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'content.missing',
					`${config.label} content path does not exist: ${path.relative(project.rootDir, contentPath)}`,
					{ path: config.path }
				)
			);
		}

		if (config.content.mode === 'directory') {
			if (!config.content.template) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'template.missing-config',
						`${config.label} directory content is missing content.template`,
						{ path: config.path }
					)
				);
			} else {
				const templatePath = resolveConfigRelativePath(project.rootDir, config.path, config.content.template);
				try {
					await import('node:fs/promises').then(({ access }) => access(templatePath));
				} catch {
					diagnostics.push(
						createDiagnostic(
							'error',
							'template.missing',
							`${config.label} template path does not exist: ${path.relative(project.rootDir, templatePath)}`,
							{ path: config.path }
						)
					);
				}
			}
		}
	}

	if (!project.navigationManifest.exists) {
		diagnostics.push(
			createDiagnostic(
				'warning',
				'manifest.missing',
				`${NAVIGATION_MANIFEST_PATH} does not exist`
			)
		);
	} else if (project.navigationManifest.error) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'manifest.invalid',
				`Could not parse ${NAVIGATION_MANIFEST_PATH}: ${project.navigationManifest.error}`
			)
		);
	}

	diagnostics.push(...checkNavigationManifestReferences(project));

	return diagnostics;
}
