import fs from 'node:fs/promises';
import path from 'node:path';
import { checkAssetDirectories } from './diagnostics.js';
import { resolveConfigRelativePath, resolveProjectPath, toPosixPath } from './paths.js';

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

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

function getPublicAssetMapping(rootDir, ownerPath, assetsDir) {
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

function resolvePublicAssetPath(mapping, value) {
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

function visitImageFields(project, visit) {
	const blockDefinitions = getBlockDefinitions(project);

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
				visit({
					value,
					fieldPath,
					block,
					ownerPath: context.ownerPath,
					contentPath: context.contentPath,
					configPath: context.configPath,
					configLabel: context.configLabel,
					itemLabel: context.itemLabel
				});
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

			const nestedBlocks = reusableBlock.raw.blocks;
			const nestedOwnerPath = reusableBlock.path;
			const nestedContext = {
				...context,
				fieldPath,
				ownerPath: nestedOwnerPath
			};

			if (reusableBlock.raw.collection === true) {
				for (const [index, entry] of Array.isArray(value) ? value.entries() : []) {
					walkFieldBlocks(nestedBlocks, entry, {
						...nestedContext,
						fieldPath: `${fieldPath}[${index}]`
					});
				}
				continue;
			}

			walkFieldBlocks(nestedBlocks, value, nestedContext);
		}
	}

	for (const config of project.configs) {
		const content = project.contentByConfigPath.get(config.path);

		for (const [index, item] of (content?.items ?? []).entries()) {
			const itemLabel =
				item.title ??
				item.label ??
				item.slug ??
				item._tentmanId ??
				item.filename ??
				`item-${index + 1}`;

			walkFieldBlocks(config.raw.blocks, item, {
				ownerPath: config.path,
				contentPath: content?.path ?? config.path,
				configPath: config.path,
				configLabel: config.label,
				itemLabel
			});
		}
	}
}

export async function checkTentmanAssets(project) {
	const diagnostics = [...(await checkAssetDirectories(project))];
	const pendingDiagnostics = [];

	visitImageFields(project, ({ value, fieldPath, block, ownerPath, contentPath, configPath, configLabel, itemLabel }) => {
		if (typeof value !== 'string' || value.length === 0 || typeof block.assetsDir !== 'string' || block.assetsDir.length === 0) {
			return;
		}

		const mapping = getPublicAssetMapping(project.rootDir, ownerPath, block.assetsDir);
		if (!mapping) {
			return;
		}

		const resolved = resolvePublicAssetPath(mapping, value);
		if (!resolved) {
			return;
		}

		if (!resolved.matchesPrefix) {
			diagnostics.push(
				createDiagnostic(
					'error',
					'assets.path-mismatch',
					`${configLabel} item ${itemLabel} field ${fieldPath} uses ${value}, but expected a path under ${mapping.publicPrefix ?? block.assetsDir}`,
					{ path: contentPath, configPath, fieldPath, value }
				)
			);
			return;
		}

		pendingDiagnostics.push(
			absolutePathExists(resolved.absolutePath).then((exists) =>
				exists
					? null
					: createDiagnostic(
							'error',
							'assets.missing-file',
							`${configLabel} item ${itemLabel} field ${fieldPath} references missing asset ${value}`,
							{ path: contentPath, configPath, fieldPath, value }
						)
			)
		);
	});

	for (const result of await Promise.all(pendingDiagnostics)) {
		if (result) {
			diagnostics.push(result);
		}
	}

	return diagnostics;
}
