import fs from 'node:fs/promises';
import { detectJsonIndent, updateContentRecordFileSource } from './content-files.js';
import { createTentmanId, describeTentmanId } from './ids.js';
import { parseJsonObject, serializeJson } from './json.js';
import { resolveConfigRelativePath, resolveProjectPath } from './paths.js';
import { isTentmanGroupBlock, TENTMAN_GROUP_STORAGE_KEY } from './tentman-group.js';

function hasUsableTentmanId(value) {
	return describeTentmanId(value) === 'valid';
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

function getJsonStringPropertyIndent(source, propertyKey) {
	const match = source.match(new RegExp(`^(\\s*)"${propertyKey}"\\s*:`, 'm'));
	return match?.[1] ?? '\t';
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceOrInsertJsonStringProperty(source, propertyKey, propertyValue, anchorKey) {
	const propertyIndent = getJsonStringPropertyIndent(source, anchorKey);
	const existingPropertyPattern = new RegExp(
		`^(${escapeRegExp(propertyIndent)})"${propertyKey}"\\s*:\\s*"[^"]*"\\s*(,?)\\s*$`,
		'm'
	);

	if (existingPropertyPattern.test(source)) {
		return source.replace(
			existingPropertyPattern,
			(_match, indent, trailingComma) =>
				`${indent}"${propertyKey}": ${JSON.stringify(propertyValue)}${trailingComma}`
		);
	}

	const serializedProperty = `${propertyIndent}"${propertyKey}": ${JSON.stringify(propertyValue)},`;
	const anchorPattern = new RegExp(
		`^(${escapeRegExp(propertyIndent)})"${anchorKey}"\\s*:\\s*("[^"]*"|[^,\\n]+),?\\s*$`,
		'm'
	);
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
	const nextSource = updateContentRecordFileSource(source, relativePath, (record) =>
		insertObjectPropertyAfterKey(record, 'title', '_tentmanId', id)
	);

	if (nextSource !== source) {
		await fs.writeFile(absolutePath, nextSource);
	}
}

async function writeDirectoryItemStringField(project, item, propertyKey, propertyValue) {
	const relativePath = item.__tentmanSourcePath;
	if (!relativePath) {
		throw new Error(`Cannot write item field for ${item.title ?? item.slug ?? 'unknown item'}`);
	}

	const absolutePath = resolveProjectPath(project.rootDir, relativePath);
	const source = await fs.readFile(absolutePath, 'utf8');
	const nextSource = updateContentRecordFileSource(source, relativePath, (record) =>
		insertObjectPropertyAfterKey(record, '_tentmanId', propertyKey, propertyValue)
	);

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
	const indent = detectJsonIndent(source);

	if (Array.isArray(parsed)) {
		const nextItems = parsed.map((item, index) =>
			itemIdsByIndex.has(index)
				? insertObjectPropertyAfterKey(item, 'title', '_tentmanId', itemIdsByIndex.get(index))
				: item
		);
		await fs.writeFile(contentPath, `${JSON.stringify(nextItems, null, indent)}\n`);
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
		await fs.writeFile(contentPath, `${JSON.stringify(nextContent, null, indent)}\n`);
	}
}

async function writeFileContentItemStringFields(project, config, fieldWritesByIndex) {
	if (fieldWritesByIndex.size === 0) {
		return;
	}

	const contentPath = resolveConfigRelativePath(project.rootDir, config.path, config.content.path);
	const source = await fs.readFile(contentPath, 'utf8');
	const parsed = JSON.parse(source);
	const indent = detectJsonIndent(source);

	function applyFields(item, index) {
		const fieldWrites = fieldWritesByIndex.get(index);
		if (!fieldWrites) {
			return item;
		}

		return Object.entries(fieldWrites).reduce((nextItem, [propertyKey, propertyValue]) => {
			return insertObjectPropertyAfterKey(nextItem, '_tentmanId', propertyKey, propertyValue);
		}, item);
	}

	if (Array.isArray(parsed)) {
		await fs.writeFile(contentPath, `${JSON.stringify(parsed.map(applyFields), null, indent)}\n`);
		return;
	}

	if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
		await fs.writeFile(
			contentPath,
			`${JSON.stringify({
				...parsed,
				items: parsed.items.map(applyFields)
			}, null, indent)}\n`
		);
	}
}

function configHasTentmanGroupBlock(config) {
	return Array.isArray(config.raw.blocks) && config.raw.blocks.some((block) => isTentmanGroupBlock(block));
}

function getTentmanGroupIdByLegacyValue(config) {
	return new Map(
		config.groups.flatMap((group) =>
			typeof group.value === 'string' &&
			group.value.length > 0 &&
			typeof group._tentmanId === 'string' &&
			group._tentmanId.length > 0
				? [[group.value, group._tentmanId]]
				: []
		)
	);
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
		const fileContentItemFieldWrites = new Map();
		const shouldBackfillGroupIds = configHasTentmanGroupBlock(config);
		const groupIdByLegacyValue = getTentmanGroupIdByLegacyValue({
			...config,
			groups: config.groups.map((group, index) =>
				groupIdsByIndex.has(index) ? { ...group, _tentmanId: groupIdsByIndex.get(index) } : group
			)
		});

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

		if (shouldBackfillGroupIds) {
			for (const [index, item] of (content?.items ?? []).entries()) {
				if (
					typeof item[TENTMAN_GROUP_STORAGE_KEY] === 'string' &&
					item[TENTMAN_GROUP_STORAGE_KEY].length > 0
				) {
					continue;
				}

				const legacyGroupValue =
					typeof item.group === 'string' && item.group.length > 0 ? item.group : null;
				const nextGroupId = legacyGroupValue ? groupIdByLegacyValue.get(legacyGroupValue) : null;

				if (!nextGroupId) {
					continue;
				}

				changes.push({
					kind: 'item-group',
					path: item.__tentmanSourcePath ?? content.path,
					index,
					id: nextGroupId
				});

				if (config.content.mode === 'directory') {
					await writeDirectoryItemStringField(
						project,
						item,
						TENTMAN_GROUP_STORAGE_KEY,
						nextGroupId
					);
				} else {
					const sourceIndex = item.__tentmanSourceIndex ?? index;
					fileContentItemFieldWrites.set(sourceIndex, {
						...(fileContentItemFieldWrites.get(sourceIndex) ?? {}),
						[TENTMAN_GROUP_STORAGE_KEY]: nextGroupId
					});
				}
			}
		}

		if (config.content.mode === 'file') {
			await writeFileContentItemIds(project, config, fileContentItemIds);
			await writeFileContentItemStringFields(project, config, fileContentItemFieldWrites);
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
		itemGroups: changes.filter((change) => change.kind === 'item-group').length,
		files: changedFiles.size
	};
}
