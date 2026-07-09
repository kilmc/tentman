import fs from 'node:fs/promises';
import path from 'node:path';
import {
	getConfigByReference,
	getConfigReferences,
	getItemReferences,
	getPrimaryConfigReference,
	getPrimaryItemReference
} from './references.js';
import { resolveProjectPath, toPosixPath } from './paths.js';
import { resolveManagedAssetValue } from './assets-config.js';

const MARKDOWN_IMAGE_PATTERN =
	/!\[[^\]]*]\((?:<([^>\s]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g;
const MARKDOWN_LINK_PATTERN =
	/(?<!!)\[[^\]]*]\((?:<([^>\s]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g;
const HTML_MEDIA_SRC_PATTERN =
	/<(?:img|audio|video|source|embed|track)\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1[^>]*?>/gi;
const HTML_VIDEO_POSTER_PATTERN =
	/<video\b[^>]*?\bposter\s*=\s*(["'])(.*?)\1[^>]*?>/gi;

function isFileLikeMarkdownDestination(value) {
	if (typeof value !== 'string') {
		return false;
	}

	const pathname = value.split(/[?#]/, 1)[0] ?? value;
	const filename = pathname.split('/').filter(Boolean).at(-1) ?? '';
	return /\.[a-z0-9]{1,12}$/i.test(filename);
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

function getConfigKind(config) {
	return config.collection === true || typeof config.collection === 'object'
		? 'collection'
		: 'singleton';
}

function getItemLabel(item, index) {
	return (
		item.title ?? item.label ?? item.slug ?? item._tentmanId ?? item.filename ?? `item-${index + 1}`
	);
}

function collectMarkdownAssetValues(value) {
	if (typeof value !== 'string' || value.length === 0) {
		return [];
	}

	const assetValues = [
		...[...value.matchAll(MARKDOWN_IMAGE_PATTERN)].map((match) => ({
			kind: 'markdownImages',
			value: match[1] ?? match[2]
		})),
		...[...value.matchAll(MARKDOWN_LINK_PATTERN)]
			.map((match) => ({
				kind: 'markdownLinks',
				value: match[1] ?? match[2]
			}))
			.filter((asset) => isFileLikeMarkdownDestination(asset.value)),
		...[...value.matchAll(HTML_MEDIA_SRC_PATTERN)].map((match) => ({
			kind: 'htmlMedia',
			value: match[2]
		})),
		...[...value.matchAll(HTML_VIDEO_POSTER_PATTERN)].map((match) => ({
			kind: 'htmlMedia',
			value: match[2]
		}))
	].filter((asset) => typeof asset.value === 'string' && asset.value.length > 0);

	const seen = new Set();
	return assetValues.filter((asset) => {
		const key = `${asset.kind}:${asset.value}`;
		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
}

function summarizeConfig(config, content, assetCount) {
	return {
		label: config.label,
		kind: getConfigKind(config),
		path: config.path,
		contentMode: config.content.mode,
		contentPath: content?.path ?? config.content.path,
		contentExists: content?.exists ?? false,
		reference: getPrimaryConfigReference(config) ?? null,
		references: getConfigReferences(config),
		itemCount: content?.items?.length ?? 0,
		assetCount
	};
}

function createAssetEntry(project, config, content, context, fieldPath, value) {
	const resolved = resolveManagedAssetValue(value, project.rootConfig.assets);

	if (resolved.ignored) {
		return null;
	}

	const asset = {
		fieldPath,
		value,
		expectedPrefix: project.rootConfig.assets?.publicPath ?? null,
		matchesExpectedPath: resolved.valid
			? true
			: resolved.reason === 'public-path-mismatch'
				? false
				: null,
		resolutionError: resolved.valid ? null : resolved.reason,
		exists: null,
		projectPath: resolved.valid ? resolved.repoPath : null
	};

	return {
		asset,
		assetEntry: {
			configPath: config.path,
			configLabel: config.label,
			contentPath: content?.path ?? config.content.path,
			itemPath: context.itemPath,
			itemLabel: context.itemLabel,
			itemReference: context.itemReference,
			itemReferences: context.itemReferences,
			...asset
		}
	};
}

function addAssetEntry(project, created, context, pendingExistsChecks, assets) {
	if (!created) {
		return;
	}

	const { asset, assetEntry } = created;

	if (asset.projectPath) {
		pendingExistsChecks.push(
			absolutePathExists(resolveProjectPath(project.rootDir, asset.projectPath)).then((exists) => {
				asset.exists = exists;
				assetEntry.exists = exists;
			})
		);
	}

	context.assets.push(asset);
	assets.push(assetEntry);
}

export async function collectTentmanConfigAssets(project, config) {
	const blockDefinitions = getBlockDefinitions(project);
	const content = project.contentByConfigPath.get(config.path);
	const items = [];
	const assets = [];
	const pendingExistsChecks = [];

	function walkFieldBlocks(blocks, itemValue, context) {
		if (
			!Array.isArray(blocks) ||
			!itemValue ||
			typeof itemValue !== 'object' ||
			Array.isArray(itemValue)
		) {
			return;
		}

		for (const block of blocks) {
			if (!block || typeof block !== 'object' || Array.isArray(block)) {
				continue;
			}

			const fieldPath = context.fieldPath ? `${context.fieldPath}.${block.id}` : block.id;
			const value = getFieldValue(itemValue, block.id);

			if (block.type === 'image' && typeof value === 'string' && value.length > 0) {
				addAssetEntry(
					project,
					createAssetEntry(project, config, content, context, fieldPath, value),
					context,
					pendingExistsChecks,
					assets
				);
				continue;
			}

			if (block.type === 'markdown') {
				const assetKindCounts = new Map();
				for (const assetRef of collectMarkdownAssetValues(value)) {
					const assetKindIndex = assetKindCounts.get(assetRef.kind) ?? 0;
					assetKindCounts.set(assetRef.kind, assetKindIndex + 1);
					addAssetEntry(
						project,
						createAssetEntry(
							project,
							config,
							content,
							context,
							`${fieldPath}.${assetRef.kind}[${assetKindIndex}]`,
							assetRef.value
						),
						context,
						pendingExistsChecks,
						assets
					);
				}
				continue;
			}

			if (block.type === 'block') {
				const nestedContext = {
					...context,
					fieldPath
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
				fieldPath
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
		config: summarizeConfig(config, content, assets.length),
		items,
		assets
	};
}

async function walkDirectoryFiles(rootDir, currentDir) {
	const entries = (await fs.readdir(currentDir, { withFileTypes: true })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
	const files = [];

	for (const entry of entries) {
		const absolutePath = path.join(currentDir, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await walkDirectoryFiles(rootDir, absolutePath)));
			continue;
		}

		if (entry.isFile()) {
			files.push(toPosixPath(path.relative(rootDir, absolutePath)));
		}
	}

	return files;
}

function getRootAssetsDirectory(assets) {
	return {
		path: assets.path.replace(/\/+$/, ''),
		expectedPrefix: assets.publicPath
	};
}

export async function findUnusedTentmanAssets(project, configReference) {
	const allConfigAssets = new Map();

	for (const config of project.configs) {
		allConfigAssets.set(config.path, await collectTentmanConfigAssets(project, config));
	}

	const referencedProjectPaths = new Set(
		[...allConfigAssets.values()]
			.flatMap((detail) => detail.assets)
			.filter(
				(asset) => asset.matchesExpectedPath === true && typeof asset.projectPath === 'string'
			)
			.map((asset) => asset.projectPath)
	);

	const rootAssets = project.rootConfig.assets;

	if (!rootAssets) {
		if (!configReference) {
			return [];
		}

		const config = getConfigByReference(project).get(configReference);

		if (!config) {
			throw new Error(`Unknown content config reference: ${configReference}`);
		}

		return {
			config: summarizeConfig(config, project.contentByConfigPath.get(config.path), 0),
			directories: [],
			unusedFiles: []
		};
	}

	const directory = getRootAssetsDirectory(rootAssets);
	const absolutePath = resolveProjectPath(project.rootDir, rootAssets.path);
	const allFiles = await walkDirectoryFiles(project.rootDir, absolutePath);
	const unusedFilePaths = allFiles.filter((file) => !referencedProjectPaths.has(file));

	if (configReference) {
		const config = getConfigByReference(project).get(configReference);

		if (!config) {
			throw new Error(`Unknown content config reference: ${configReference}`);
		}

		const unusedFiles = unusedFilePaths.map((file) => ({
			path: file,
			directoryPath: directory.path,
			expectedPrefix: directory.expectedPrefix
		}));

		return {
			config: allConfigAssets.get(config.path)?.config ?? summarizeConfig(config, null, 0),
			directories: [
				{
					...directory,
					fileCount: allFiles.length,
					unusedCount: unusedFilePaths.length,
					unusedFiles: unusedFilePaths
				}
			],
			unusedFiles
		};
	}

	return [
		{
			...directory,
			configs: project.configs.map((config) => ({
				label: config.label,
				reference: getPrimaryConfigReference(config) ?? null,
				path: config.path
			})),
			fileCount: allFiles.length,
			unusedCount: unusedFilePaths.length,
			unusedFiles: unusedFilePaths
		}
	];
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
