import fs from 'node:fs/promises';
import path from 'node:path';
import { describeTentmanId } from './ids.js';
import { getNavigationReferenceId, getNavigationReferenceIds } from './manifest.js';
import { resolveConfigRelativePath, resolveProjectPath } from './paths.js';
import { NAVIGATION_MANIFEST_PATH } from './manifest.js';
import {
	getConfigByReference,
	getGroupReferences,
	getItemByReference
} from './references.js';

const ROOT_CONFIG_PATH = '.tentman.json';

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

const BUILT_IN_BLOCK_TYPES = new Set([
	'text',
	'textarea',
	'markdown',
	'email',
	'url',
	'number',
	'date',
	'boolean',
	'toggle',
	'image',
	'select',
	'tentmanGroup',
	'block'
]);

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

async function absolutePathExists(absolutePath) {
	try {
		await fs.access(absolutePath);
		return true;
	} catch {
		return false;
	}
}

function checkNavigationManifestReferences(project) {
	const manifest = project.navigationManifest.manifest;
	const diagnostics = [];

	if (!manifest) {
		return diagnostics;
	}

	const configByReference = getConfigByReference(project);

	for (const configReference of getNavigationReferenceIds(manifest.content?.items)) {
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

		for (const itemReference of getNavigationReferenceIds(collectionManifest.items)) {
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

			for (const itemReference of getNavigationReferenceIds(group.items)) {
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

	for (const configReference of getNavigationReferenceIds(manifest.content?.items)) {
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
			...getNavigationReferenceIds(collectionManifest.items),
			...(collectionManifest.groups?.flatMap((group) => getNavigationReferenceIds(group.items)) ?? [])
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

		if (collectionManifest.id) {
			addLegacyReferenceDiagnostic(
				diagnostics,
				{ kind: 'collection', label: `Collection ${config.label}` },
				getNavigationReferenceId(collectionManifest.id),
				config._tentmanId
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

export function walkBlocks(blocks, visit) {
	if (!Array.isArray(blocks)) {
		return;
	}

	for (const block of blocks) {
		if (!block || typeof block !== 'object' || Array.isArray(block)) {
			continue;
		}

		visit(block);

		if (Array.isArray(block.blocks)) {
			walkBlocks(block.blocks, visit);
		}
	}
}

function checkBlocks(project) {
	const diagnostics = [];

	if (project.blocksDir && !project.blocksDirExists) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'blocks.missing-directory',
				`Configured blocks directory does not exist: ${project.blocksDir}`,
				{ path: ROOT_CONFIG_PATH }
			)
		);
		return diagnostics;
	}

	const blockById = new Map();
	for (const block of project.blocks) {
		if (block.error) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'blocks.invalid',
					`Could not parse block config ${block.path}: ${block.error}`,
					{ path: block.path }
				)
			);
			continue;
		}

		const existing = blockById.get(block.id);
		if (existing) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'blocks.duplicate-id',
					`Reusable block ${block.id} is declared more than once`,
					{ path: block.path, id: block.id, duplicateOf: existing.path }
				)
			);
			continue;
		}

		blockById.set(block.id, block);
	}

	function checkBlockTree(blocks, ownerPath, ownerLabel) {
		walkBlocks(blocks, (block) => {
			if (typeof block.type !== 'string' || BUILT_IN_BLOCK_TYPES.has(block.type)) {
				return;
			}

			if (!blockById.has(block.type)) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'blocks.unresolved',
						`${ownerLabel} references unknown reusable block type: ${block.type}`,
						{ path: ownerPath, blockId: block.id, blockType: block.type }
					)
				);
			}
		});
	}

	for (const config of project.configs) {
		checkBlockTree(config.raw.blocks, config.path, `${config.label} config`);
	}

	for (const block of project.blocks) {
		if (!block.error) {
			checkBlockTree(block.raw.blocks, block.path, `${block.label} block`);
		}
	}

	return diagnostics;
}

function checkPlugins(project) {
	const diagnostics = [];
	const registeredPluginIds = new Set();
	const missingPluginIds = new Set();

	if (project.rootConfig.plugins.length > 0 && !project.pluginsDirExists) {
		diagnostics.push(
			createDiagnostic(
				'error',
				'plugin.missing-directory',
				`Configured plugins directory does not exist: ${project.pluginsDir}`,
				{ path: ROOT_CONFIG_PATH }
			)
		);
	}

	for (const plugin of project.plugins) {
		if (registeredPluginIds.has(plugin.id)) {
			diagnostics.push(
				createDiagnostic(
					'warning',
					'plugin.duplicate-registration',
					`Plugin ${plugin.id} is registered more than once in ${ROOT_CONFIG_PATH}`,
					{ path: ROOT_CONFIG_PATH, id: plugin.id }
				)
			);
			continue;
		}

		registeredPluginIds.add(plugin.id);

		if (!plugin.exists) {
			missingPluginIds.add(plugin.id);
			diagnostics.push(
				createDiagnostic(
					'error',
					'plugin.missing',
					`Registered plugin ${plugin.id} could not be resolved in ${project.pluginsDir}`,
					{ path: ROOT_CONFIG_PATH, id: plugin.id, candidates: plugin.paths }
				)
			);
		}
	}

	function checkBlockPlugins(blocks, ownerPath, ownerLabel) {
		walkBlocks(blocks, (block) => {
			if (!Array.isArray(block.plugins)) {
				return;
			}

			if (block.type !== 'markdown') {
				diagnostics.push(
					createDiagnostic(
						'error',
						'plugin.unsupported-surface',
						`${ownerLabel} enables plugins on non-markdown block ${block.id ?? block.type}`,
						{ path: ownerPath, blockId: block.id, blockType: block.type }
					)
				);
			}

			for (const pluginId of block.plugins) {
				if (typeof pluginId !== 'string' || pluginId.length === 0) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'plugin.invalid-reference',
							`${ownerLabel} contains an invalid plugin reference`,
							{ path: ownerPath, blockId: block.id }
						)
					);
					continue;
				}

				if (!registeredPluginIds.has(pluginId)) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'plugin.unregistered',
							`${ownerLabel} references unregistered plugin ${pluginId}`,
							{ path: ownerPath, blockId: block.id, blockType: block.type, id: pluginId }
						)
					);
					continue;
				}

				if (missingPluginIds.has(pluginId)) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'plugin.unresolved',
							`${ownerLabel} references plugin ${pluginId}, but its entrypoint is missing`,
							{ path: ownerPath, blockId: block.id, blockType: block.type, id: pluginId }
						)
					);
				}
			}
		});
	}

	for (const config of project.configs) {
		checkBlockPlugins(config.raw.blocks, config.path, `${config.label} config`);
	}

	for (const block of project.blocks) {
		if (!block.error) {
			checkBlockPlugins(block.raw.blocks, block.path, `${block.label} block`);
		}
	}

	return diagnostics;
}

export async function checkAssetDirectories(project) {
	const diagnostics = [];

	async function checkAssetDir(ownerPath, ownerLabel, block) {
		if (
			!block ||
			typeof block !== 'object' ||
			Array.isArray(block) ||
			typeof block.assetsDir !== 'string' ||
			block.assetsDir.length === 0
		) {
			return;
		}

		const assetPath = resolveConfigRelativePath(project.rootDir, ownerPath, block.assetsDir);

		if (!(await absolutePathExists(assetPath))) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'assets.missing-directory',
					`${ownerLabel} references missing assets directory: ${path.relative(project.rootDir, assetPath)}`,
					{ path: ownerPath, blockId: block.id, blockType: block.type }
				)
			);
		}
	}

	if (project.rootConfig.assetsDir) {
		const rootAssetsPath = resolveProjectPath(project.rootDir, project.rootConfig.assetsDir);

		if (!(await absolutePathExists(rootAssetsPath))) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'assets.missing-root-directory',
					`Configured assets directory does not exist: ${project.rootConfig.assetsDir}`,
					{ path: ROOT_CONFIG_PATH }
				)
			);
		}
	}

	for (const config of project.configs) {
		const blocks = [];
		walkBlocks(config.raw.blocks, (block) => {
			blocks.push(block);
		});

		for (const block of blocks) {
			await checkAssetDir(config.path, `${config.label} config`, block);
		}
	}

	for (const block of project.blocks) {
		if (block.error) {
			continue;
		}

		const nestedBlocks = [];
		walkBlocks(block.raw.blocks, (nestedBlock) => {
			nestedBlocks.push(nestedBlock);
		});

		for (const nestedBlock of nestedBlocks) {
			await checkAssetDir(block.path, `${block.label} block`, nestedBlock);
		}
	}

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

	diagnostics.push(...checkBlocks(project));
	diagnostics.push(...checkPlugins(project));
	diagnostics.push(...(await checkAssetDirectories(project)));
	diagnostics.push(...checkNavigationManifestReferences(project));

	return diagnostics;
}
