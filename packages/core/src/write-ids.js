import fs from 'node:fs/promises';
import { createTentmanId } from './ids.js';
import { parseJsonObject } from './json.js';
import { resolveConfigRelativePath, resolveProjectPath } from './paths.js';

function hasUsableTentmanId(value) {
	return typeof value === 'string' && value.length > 0;
}

function insertObjectPropertyAfterKey(object, anchorKey, propertyKey, propertyValue) {
	if (Object.hasOwn(object, propertyKey)) {
		return {
			...object,
			[propertyKey]: propertyValue
		};
	}

	const output = {};
	let inserted = false;

	for (const [key, value] of Object.entries(object)) {
		output[key] = value;

		if (key === anchorKey) {
			output[propertyKey] = propertyValue;
			inserted = true;
		}
	}

	if (inserted) {
		return output;
	}

	return {
		[propertyKey]: propertyValue,
		...output
	};
}

function serializeJson(value) {
	return `${JSON.stringify(value, null, '\t')}\n`;
}

function getJsonStringPropertyIndent(source, propertyKey) {
	const match = source.match(new RegExp(`^(\\s*)"${propertyKey}"\\s*:`, 'm'));
	return match?.[1] ?? '\t';
}

function replaceOrInsertJsonStringProperty(source, propertyKey, propertyValue, anchorKey) {
	const serializedProperty = `${getJsonStringPropertyIndent(source, anchorKey)}"${propertyKey}": ${JSON.stringify(propertyValue)},`;
	const existingPropertyPattern = new RegExp(
		`^(\\s*)"${propertyKey}"\\s*:\\s*"[^"]*"\\s*,?\\s*$`,
		'm'
	);

	if (existingPropertyPattern.test(source)) {
		return source.replace(existingPropertyPattern, serializedProperty);
	}

	const anchorPattern = new RegExp(`^(\\s*)"${anchorKey}"\\s*:\\s*("[^"]*"|[^,\\n]+),?\\s*$`, 'm');
	const anchorMatch = source.match(anchorPattern);

	if (!anchorMatch) {
		const openingBraceMatch = source.match(/^(\s*)\{\s*$/m);
		if (!openingBraceMatch) {
			throw new Error(`Could not insert ${propertyKey} into JSON object`);
		}

		return source.replace(openingBraceMatch[0], `${openingBraceMatch[0]}\n${serializedProperty}`);
	}

	return source.replace(anchorMatch[0], `${anchorMatch[0]}\n${serializedProperty}`);
}

function addTentmanIdToJsonObjectSource(source, id, context) {
	parseJsonObject(source, context);
	return replaceOrInsertJsonStringProperty(source, '_tentmanId', id, 'label');
}

function addTentmanIdToMarkdownFrontmatter(source, id) {
	if (!source.startsWith('---')) {
		throw new Error('Markdown file is missing frontmatter');
	}

	const endIndex = source.indexOf('\n---', 3);
	if (endIndex === -1) {
		throw new Error('Markdown file has unterminated frontmatter');
	}

	const frontmatter = source.slice(4, endIndex);
	const rest = source.slice(endIndex);
	const lines = frontmatter.split('\n');

	if (lines.some((line) => /^_tentmanId\s*:/.test(line))) {
		return source.replace(/^_tentmanId\s*:.*$/m, `_tentmanId: '${id}'`);
	}

	const titleIndex = lines.findIndex((line) => /^title\s*:/.test(line));
	const insertIndex = titleIndex === -1 ? 0 : titleIndex + 1;
	const nextLines = [...lines];
	nextLines.splice(insertIndex, 0, `_tentmanId: '${id}'`);

	return `---\n${nextLines.join('\n')}${rest}`;
}

async function writeConfigId(project, config, id) {
	const absolutePath = resolveProjectPath(project.rootDir, config.path);
	const source = await fs.readFile(absolutePath, 'utf8');
	const nextSource = addTentmanIdToJsonObjectSource(source, id, config.path);

	if (nextSource !== source) {
		await fs.writeFile(absolutePath, nextSource);
	}
}

async function writeCollectionGroupIds(project, config, groupIdsByIndex) {
	if (groupIdsByIndex.size === 0) {
		return;
	}

	const absolutePath = resolveProjectPath(project.rootDir, config.path);
	const source = await fs.readFile(absolutePath, 'utf8');
	const parsed = parseJsonObject(source, config.path);

	if (!parsed.collection || typeof parsed.collection !== 'object' || Array.isArray(parsed.collection)) {
		throw new Error(`Cannot write collection group ids for ${config.path}`);
	}

	const groups = parsed.collection.groups;
	if (!Array.isArray(groups)) {
		throw new Error(`Cannot write collection group ids for ${config.path}`);
	}

	const nextConfig = {
		...parsed,
		collection: {
			...parsed.collection,
			groups: groups.map((group, index) =>
				groupIdsByIndex.has(index)
					? insertObjectPropertyAfterKey(group, 'label', '_tentmanId', groupIdsByIndex.get(index))
					: group
			)
		}
	};

	await fs.writeFile(absolutePath, serializeJson(nextConfig));
}

async function writeDirectoryItemId(project, item, id) {
	const relativePath = item.__tentmanSourcePath;
	if (!relativePath) {
		throw new Error(`Cannot write item id for ${item.title ?? item.slug ?? 'unknown item'}`);
	}

	const absolutePath = resolveProjectPath(project.rootDir, relativePath);
	const source = await fs.readFile(absolutePath, 'utf8');
	const nextSource = relativePath.endsWith('.json')
		? addTentmanIdToJsonObjectSource(source, id, relativePath)
		: addTentmanIdToMarkdownFrontmatter(source, id);

	if (nextSource !== source) {
		await fs.writeFile(absolutePath, nextSource);
	}
}

async function writeFileContentItemIds(project, config, itemIdsByIndex) {
	if (itemIdsByIndex.size === 0) {
		return;
	}

	const contentPath = resolveConfigRelativePath(project.rootDir, config.path, config.content.path);
	const source = await fs.readFile(contentPath, 'utf8');
	const parsed = JSON.parse(source);

	if (Array.isArray(parsed)) {
		const nextItems = parsed.map((item, index) =>
			itemIdsByIndex.has(index)
				? insertObjectPropertyAfterKey(item, 'title', '_tentmanId', itemIdsByIndex.get(index))
				: item
		);
		await fs.writeFile(contentPath, serializeJson(nextItems));
		return;
	}

	if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
		const nextContent = {
			...parsed,
			items: parsed.items.map((item, index) =>
				itemIdsByIndex.has(index)
					? insertObjectPropertyAfterKey(item, 'title', '_tentmanId', itemIdsByIndex.get(index))
					: item
			)
		};
		await fs.writeFile(contentPath, serializeJson(nextContent));
	}
}

export async function writeMissingTentmanIds(project, options = {}) {
	const generateId = options.generateId ?? createTentmanId;
	const changes = [];

	for (const config of project.configs) {
		if (!hasUsableTentmanId(config._tentmanId)) {
			const id = generateId();
			await writeConfigId(project, config, id);
			changes.push({ kind: 'config', path: config.path, id });
		}

		const groupIdsByIndex = new Map();
		for (const [index, group] of config.groups.entries()) {
			if (hasUsableTentmanId(group._tentmanId)) {
				continue;
			}

			const id = generateId();
			groupIdsByIndex.set(index, id);
			changes.push({
				kind: 'group',
				path: config.path,
				index,
				id
			});
		}

		await writeCollectionGroupIds(project, config, groupIdsByIndex);

		if (config.collection !== true && typeof config.collection !== 'object') {
			continue;
		}

		const content = project.contentByConfigPath.get(config.path);
		const fileContentItemIds = new Map();

		for (const [index, item] of (content?.items ?? []).entries()) {
			if (hasUsableTentmanId(item._tentmanId)) {
				continue;
			}

			const id = generateId();
			changes.push({
				kind: 'item',
				path: item.__tentmanSourcePath ?? content.path,
				index,
				id
			});

			if (config.content.mode === 'directory') {
				await writeDirectoryItemId(project, item, id);
			} else {
				fileContentItemIds.set(item.__tentmanSourceIndex ?? index, id);
			}
		}

		if (config.content.mode === 'file') {
			await writeFileContentItemIds(project, config, fileContentItemIds);
		}
	}

	return changes;
}

export function summarizeIdWriteChanges(changes) {
	const changedFiles = new Set(changes.map((change) => change.path));

	return {
		configs: changes.filter((change) => change.kind === 'config').length,
		groups: changes.filter((change) => change.kind === 'group').length,
		items: changes.filter((change) => change.kind === 'item').length,
		files: changedFiles.size
	};
}
