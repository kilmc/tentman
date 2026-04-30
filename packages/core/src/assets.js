import fs from 'node:fs/promises';
import path from 'node:path';
import {
	getConfigByReference,
	getConfigReferences,
	getItemReferences,
	getPrimaryConfigReference,
	getPrimaryItemReference
} from './references.js';
import { resolveConfigRelativePath, resolveProjectPath, toPosixPath } from './paths.js';

async function absolutePathExists(absolutePath) {
	try {
		await fs.access(absolutePath);
		return true;
	} catch {
		return false;
	}
}

function getBlockDefinitions(project) {
	const definitions = new Map();

	for (const block of project.blocks) {
		if (block.error) {
			continue;
		}

		definitions.set(block.id, block);
	}

	return definitions;
}

function getFieldValue(record, key) {
	if (!record || typeof record !== 'object' || Array.isArray(record) || typeof key !== 'string') {
		return undefined;
	}

	return record[key];
}

export function getPublicAssetMapping(rootDir, ownerPath, assetsDir) {
	if (typeof assetsDir !== 'string' || assetsDir.length === 0) {
		return null;
	}

	const assetDirPath = resolveConfigRelativePath(rootDir, ownerPath, assetsDir);

	for (const publicDir of ['static', 'public']) {
		const publicRoot = resolveProjectPath(rootDir, publicDir);
		const relativePath = path.relative(publicRoot, assetDirPath);

		if (
			relativePath === '' ||
			(relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`))
		) {
			const publicPrefix = relativePath.length === 0 ? '/' : `/${toPosixPath(relativePath)}`;
			return { assetDirPath, publicPrefix, publicRoot };
		}
	}

	return { assetDirPath, publicPrefix: null, publicRoot: null };
}

export function resolvePublicAssetPath(mapping, value) {
	if (!mapping || !mapping.publicPrefix || !mapping.publicRoot || typeof value !== 'string') {
		return null;
	}

	if (!value.startsWith('/')) {
		return { matchesPrefix: false };
	}

	const normalizedPrefix = mapping.publicPrefix === '/' ? '/' : `${mapping.publicPrefix}/`;
	const matchesPrefix =
		mapping.publicPrefix === '/'
			? true
			: value === mapping.publicPrefix || value.startsWith(normalizedPrefix);

	if (!matchesPrefix) {
		return { matchesPrefix: false };
	}

	return {
		matchesPrefix: true,
		absolutePath: path.resolve(mapping.publicRoot, `.${value}`)
	};
}

function getConfigKind(config) {
	return config.collection === true || typeof config.collection === 'object' ? 'collection' : 'singleton';
}

function getItemLabel(item, index) {
	return (
		item.title ??
		item.label ??
		item.slug ??
		item._tentmanId ??
		item.filename ??
		`item-${index + 1}`
	);
}

export async function collectTentmanConfigAssets(project, config) {
	const blockDefinitions = getBlockDefinitions(project);
	const content = project.contentByConfigPath.get(config.path);
	const items = [];
	const assets = [];
	const pendingExistsChecks = [];

	function walkFieldBlocks(blocks, itemValue, context) {
		if (!Array.isArray(blocks) || !itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) {
			return;
		}

		for (const block of blocks) {
			if (!block || typeof block !== 'object' || Array.isArray(block)) {
				continue;
			}

			const fieldPath = context.fieldPath ? `${context.fieldPath}.${block.id}` : block.id;
			const value = getFieldValue(itemValue, block.id);

			if (block.type === 'image') {
				if (typeof value !== 'string' || value.length === 0 || typeof block.assetsDir !== 'string' || block.assetsDir.length === 0) {
					continue;
				}

				const mapping = getPublicAssetMapping(project.rootDir, context.ownerPath, block.assetsDir);
				const resolved = mapping ? resolvePublicAssetPath(mapping, value) : null;
				const asset = {
					fieldPath,
					value,
					assetsDir: block.assetsDir,
					expectedPrefix: mapping?.publicPrefix ?? null,
					matchesExpectedPath: resolved?.matchesPrefix ?? null,
					exists: null,
					projectPath: null
				};

				const assetEntry = {
					configPath: config.path,
					configLabel: config.label,
					contentPath: content?.path ?? config.content.path,
					itemPath: context.itemPath,
					itemLabel: context.itemLabel,
					itemReference: context.itemReference,
					itemReferences: context.itemReferences,
					...asset
				};

				if (resolved?.matchesPrefix && resolved.absolutePath) {
					asset.projectPath = toPosixPath(path.relative(project.rootDir, resolved.absolutePath));
					assetEntry.projectPath = asset.projectPath;
					pendingExistsChecks.push(
						absolutePathExists(resolved.absolutePath).then((exists) => {
							asset.exists = exists;
							assetEntry.exists = exists;
						})
					);
				}

				context.assets.push(asset);
				assets.push(assetEntry);
				continue;
			}

			if (block.type === 'block') {
				const nestedContext = {
					...context,
					fieldPath,
					ownerPath: context.ownerPath
				};

				if (block.collection === true) {
					for (const [index, entry] of Array.isArray(value) ? value.entries() : []) {
						walkFieldBlocks(block.blocks, entry, {
							...nestedContext,
							fieldPath: `${fieldPath}[${index}]`
						});
					}
					continue;
				}

				walkFieldBlocks(block.blocks, value, nestedContext);
				continue;
			}

			const reusableBlock = blockDefinitions.get(block.type);
			if (!reusableBlock || reusableBlock.error) {
				continue;
			}

			const nestedContext = {
				...context,
				fieldPath,
				ownerPath: reusableBlock.path
			};

			if (reusableBlock.raw.collection === true) {
				for (const [index, entry] of Array.isArray(value) ? value.entries() : []) {
					walkFieldBlocks(reusableBlock.raw.blocks, entry, {
						...nestedContext,
						fieldPath: `${fieldPath}[${index}]`
					});
				}
				continue;
			}

			walkFieldBlocks(reusableBlock.raw.blocks, value, nestedContext);
		}
	}

	for (const [index, item] of (content?.items ?? []).entries()) {
		const itemAssets = [];
		walkFieldBlocks(config.raw.blocks, item, {
			assets: itemAssets,
			ownerPath: config.path,
			fieldPath: '',
			itemLabel: getItemLabel(item, index),
			itemReference: getPrimaryItemReference(item) ?? null,
			itemReferences: getItemReferences(item),
			itemPath: item.__tentmanSourcePath ?? null
		});

		items.push({
			label: getItemLabel(item, index),
			reference: getPrimaryItemReference(item) ?? null,
			references: getItemReferences(item),
			path: item.__tentmanSourcePath ?? null,
			index,
			assets: itemAssets
		});
	}

	await Promise.all(pendingExistsChecks);

	return {
		config: {
			label: config.label,
			kind: getConfigKind(config),
			path: config.path,
			contentMode: config.content.mode,
			contentPath: content?.path ?? config.content.path,
			contentExists: content?.exists ?? false,
			reference: getPrimaryConfigReference(config) ?? null,
			references: getConfigReferences(config),
			itemCount: content?.items?.length ?? 0,
			assetCount: assets.length
		},
		items,
		assets
	};
}

export async function listTentmanAssets(project, configReference) {
	if (!configReference) {
		const summaries = [];

		for (const config of project.configs) {
			const detail = await collectTentmanConfigAssets(project, config);
			summaries.push(detail.config);
		}

		return summaries;
	}

	const config = getConfigByReference(project).get(configReference);

	if (!config) {
		throw new Error(`Unknown content config reference: ${configReference}`);
	}

	return collectTentmanConfigAssets(project, config);
}
