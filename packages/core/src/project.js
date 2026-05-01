import fs from 'node:fs/promises';
import path from 'node:path';
import {
	parseJsonObject,
	readOptionalString,
	readOptionalStringArray,
	readRequiredString
} from './json.js';
import {
	getPathRelativeToRoot,
	resolveConfigRelativePath,
	resolveProjectPath,
	stripLeadingDotSlash,
	toPosixPath
} from './paths.js';
import { NAVIGATION_MANIFEST_PATH, parseNavigationManifest } from './manifest.js';

export const ROOT_CONFIG_PATH = '.tentman.json';

async function pathExists(absolutePath) {
	try {
		await fs.access(absolutePath);
		return true;
	} catch {
		return false;
	}
}

async function walkDirectory(rootDir, currentDir) {
	const entries = (await fs.readdir(currentDir, { withFileTypes: true })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
	const files = [];

	for (const entry of entries) {
		const absolutePath = path.join(currentDir, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await walkDirectory(rootDir, absolutePath)));
			continue;
		}

		if (entry.isFile()) {
			files.push(getPathRelativeToRoot(rootDir, absolutePath));
		}
	}

	return files;
}

export function parseRootConfig(source) {
	const input = parseJsonObject(source, ROOT_CONFIG_PATH);

	return {
		siteName: readOptionalString(input, 'siteName', ROOT_CONFIG_PATH),
		blocksDir: readOptionalString(input, 'blocksDir', ROOT_CONFIG_PATH),
		configsDir: readOptionalString(input, 'configsDir', ROOT_CONFIG_PATH),
		assetsDir: readOptionalString(input, 'assetsDir', ROOT_CONFIG_PATH),
		pluginsDir: readOptionalString(input, 'pluginsDir', ROOT_CONFIG_PATH),
		plugins: readOptionalStringArray(input, 'plugins', ROOT_CONFIG_PATH) ?? [],
		content:
			input.content && typeof input.content === 'object' && !Array.isArray(input.content)
				? input.content
				: undefined,
		local:
			input.local && typeof input.local === 'object' && !Array.isArray(input.local)
				? input.local
				: undefined,
		netlify:
			input.netlify && typeof input.netlify === 'object' && !Array.isArray(input.netlify)
				? input.netlify
				: undefined,
		raw: input
	};
}

function parseBlockConfig(source, blockPath) {
	const input = parseJsonObject(source, blockPath);

	if (input.type !== 'block') {
		throw new Error(`${blockPath}.type must be "block"`);
	}

	return {
		path: blockPath,
		id: readRequiredString(input, 'id', blockPath),
		label: readRequiredString(input, 'label', blockPath),
		raw: input
	};
}

function parseContentConfig(source, configPath) {
	const input = parseJsonObject(source, configPath);
	const slug = path.basename(configPath, '.tentman.json');

	if (input.type !== 'content') {
		throw new Error(`${configPath}.type must be "content"`);
	}

	const content = input.content;
	if (!content || typeof content !== 'object' || Array.isArray(content)) {
		throw new Error(`${configPath}.content must be an object`);
	}

	const mode = readRequiredString(content, 'mode', `${configPath}.content`);
	if (mode !== 'file' && mode !== 'directory') {
		throw new Error(`${configPath}.content.mode must be "file" or "directory"`);
	}

	const collection = input.collection;
	const collectionGroups =
		collection && typeof collection === 'object' && !Array.isArray(collection)
			? Array.isArray(collection.groups)
				? collection.groups
				: []
			: [];

	return {
		path: configPath,
		slug,
		type: 'content',
		id: readOptionalString(input, 'id', configPath),
		_tentmanId: readOptionalString(input, '_tentmanId', configPath),
		label: readRequiredString(input, 'label', configPath),
		content: {
			mode,
			path: readRequiredString(content, 'path', `${configPath}.content`),
			template: readOptionalString(content, 'template', `${configPath}.content`)
		},
		collection,
		groups: collectionGroups.map((group, index) => {
			if (!group || typeof group !== 'object' || Array.isArray(group)) {
				throw new Error(`${configPath}.collection.groups[${index}] must be an object`);
			}

			return {
				_tentmanId: readOptionalString(group, '_tentmanId', `${configPath}.collection.groups[${index}]`),
				label: readRequiredString(group, 'label', `${configPath}.collection.groups[${index}]`),
				value: readOptionalString(group, 'value', `${configPath}.collection.groups[${index}]`)
			};
		}),
		raw: input
	};
}

async function readContentItems(rootDir, config) {
	const contentPath = resolveConfigRelativePath(rootDir, config.path, config.content.path);
	const exists = await pathExists(contentPath);

	if (!exists) {
		return { exists, items: [] };
	}

	if (config.content.mode === 'file') {
		const parsed = JSON.parse(await fs.readFile(contentPath, 'utf8'));
		const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [parsed];
		return {
			exists,
			path: getPathRelativeToRoot(rootDir, contentPath),
			items: items
				.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
				.map((item, index) => ({ ...item, __tentmanSourceIndex: index }))
		};
	}

	const files = await walkDirectory(rootDir, contentPath);
	const items = [];

	for (const file of files.filter((entry) => /\.(json|md|markdown)$/.test(entry))) {
		const absolutePath = path.resolve(rootDir, file);
		const source = await fs.readFile(absolutePath, 'utf8');
		const item = file.endsWith('.json') ? JSON.parse(source) : parseMarkdownFrontmatter(source);

		if (item && typeof item === 'object' && !Array.isArray(item)) {
			items.push({ ...item, filename: path.basename(file), __tentmanSourcePath: file });
		}
	}

	return {
		exists,
		path: getPathRelativeToRoot(rootDir, contentPath),
		items
	};
}

function parseMarkdownFrontmatter(source) {
	if (!source.startsWith('---')) {
		return {};
	}

	const endIndex = source.indexOf('\n---', 3);
	if (endIndex === -1) {
		return {};
	}

	const frontmatter = source.slice(3, endIndex).trim();
	const output = {};

	for (const line of frontmatter.split('\n')) {
		const separatorIndex = line.indexOf(':');
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
		if (key) {
			output[key] = value;
		}
	}

	return output;
}

export async function loadTentmanProject(projectRoot) {
	const rootDir = path.resolve(projectRoot);
	const rootConfigPath = resolveProjectPath(rootDir, ROOT_CONFIG_PATH);
	const rootConfigSource = await fs.readFile(rootConfigPath, 'utf8');
	const rootConfig = parseRootConfig(rootConfigSource);
	const configsDir = stripLeadingDotSlash(rootConfig.configsDir ?? 'tentman/configs');
	const configsDirPath = resolveProjectPath(rootDir, configsDir);
	const blocksDir = rootConfig.blocksDir ? stripLeadingDotSlash(rootConfig.blocksDir) : null;
	const blocksDirPath = blocksDir ? resolveProjectPath(rootDir, blocksDir) : null;
	const blocksDirExists = blocksDirPath ? await pathExists(blocksDirPath) : false;
	const pluginsDir = stripLeadingDotSlash(rootConfig.pluginsDir ?? 'tentman/plugins');
	const pluginsDirPath = resolveProjectPath(rootDir, pluginsDir);
	const pluginsDirExists = await pathExists(pluginsDirPath);
	const configPaths = (await walkDirectory(rootDir, configsDirPath))
		.filter((file) => file.endsWith('.tentman.json'))
		.sort();

	const configs = [];
	for (const configPath of configPaths) {
		const source = await fs.readFile(resolveProjectPath(rootDir, configPath), 'utf8');
		configs.push(parseContentConfig(source, configPath));
	}

	const contentByConfigPath = new Map();
	for (const config of configs) {
		contentByConfigPath.set(config.path, await readContentItems(rootDir, config));
	}

	const blocks = [];
	if (blocksDirPath && blocksDirExists) {
		const blockPaths = (await walkDirectory(rootDir, blocksDirPath))
			.filter((file) => file.endsWith('.tentman.json'))
			.sort();

		for (const blockPath of blockPaths) {
			try {
				const source = await fs.readFile(resolveProjectPath(rootDir, blockPath), 'utf8');
				blocks.push(parseBlockConfig(source, blockPath));
			} catch (error) {
				blocks.push({
					path: blockPath,
					error: error instanceof Error ? error.message : 'Failed to parse block config'
				});
			}
		}
	}

	const plugins = [];
	for (const pluginId of rootConfig.plugins) {
		const jsPath = toPosixPath(path.join(pluginsDir, pluginId, 'plugin.js'));
		const mjsPath = toPosixPath(path.join(pluginsDir, pluginId, 'plugin.mjs'));
		const jsExists = await pathExists(resolveProjectPath(rootDir, jsPath));
		const mjsExists = await pathExists(resolveProjectPath(rootDir, mjsPath));

		plugins.push({
			id: pluginId,
			paths: [jsPath, mjsPath],
			path: jsExists ? jsPath : mjsExists ? mjsPath : null,
			exists: jsExists || mjsExists
		});
	}

	const manifestPath = resolveProjectPath(rootDir, NAVIGATION_MANIFEST_PATH);
	const manifestExists = await pathExists(manifestPath);
	let manifest = null;
	let manifestError = null;

	if (manifestExists) {
		try {
			manifest = parseNavigationManifest(await fs.readFile(manifestPath, 'utf8'));
		} catch (error) {
			manifestError = error instanceof Error ? error.message : 'Failed to parse navigation manifest';
		}
	}

	return {
		rootDir,
		rootConfig,
		rootConfigSource,
		configsDir: toPosixPath(configsDir),
		configs,
		contentByConfigPath,
		blocksDir: blocksDir ? toPosixPath(blocksDir) : null,
		blocksDirExists,
		blocks,
		pluginsDir: toPosixPath(pluginsDir),
		pluginsDirExists,
		plugins,
		navigationManifest: {
			path: NAVIGATION_MANIFEST_PATH,
			exists: manifestExists,
			manifest,
			error: manifestError
		}
	};
}
