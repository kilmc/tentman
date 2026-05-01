import {
	getConfigByReference,
	getConfigReferences,
	getPrimaryConfigReference
} from './references.js';
import { isTentmanGroupBlock, TENTMAN_GROUP_STORAGE_KEY } from './tentman-group.js';

function getConfigKind(config) {
	return config.collection === true || typeof config.collection === 'object' ? 'collection' : 'singleton';
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

function summarizeConfig(project, config) {
	const content = project.contentByConfigPath.get(config.path);
	const rawBlocks = Array.isArray(config.raw.blocks) ? config.raw.blocks : [];

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
		blockCount: rawBlocks.length,
		groupCount: config.groups.length
	};
}

function summarizeField(block, blockDefinitions) {
	if (!block || typeof block !== 'object' || Array.isArray(block)) {
		return null;
	}

	const summary = {
		id: typeof block.id === 'string' ? block.id : null,
		type: typeof block.type === 'string' ? block.type : null,
		label: typeof block.label === 'string' ? block.label : null
	};

	if (block.required === true) {
		summary.required = true;
	}

	if (typeof block.show === 'string') {
		summary.show = block.show;
	}

	if (block.collection === true) {
		summary.collection = true;
	}

	if (typeof block.itemLabel === 'string') {
		summary.itemLabel = block.itemLabel;
	}

	if (typeof block.assetsDir === 'string' && block.assetsDir.length > 0) {
		summary.assetsDir = block.assetsDir;
	}

	if (Array.isArray(block.plugins) && block.plugins.length > 0) {
		summary.plugins = [...block.plugins];
	}

	if (typeof block.maxLength === 'number') {
		summary.maxLength = block.maxLength;
	}

	if (block.type === 'block') {
		summary.schemaKind = 'inline-block';
		summary.fields = (Array.isArray(block.blocks) ? block.blocks : [])
			.map((nestedBlock) => summarizeField(nestedBlock, blockDefinitions))
			.filter(Boolean);
		return summary;
	}

	if (isTentmanGroupBlock(block)) {
		summary.schemaKind = 'tentman-owned-field';
		summary.storageField = TENTMAN_GROUP_STORAGE_KEY;
		summary.collection = block.collection;
		if (block.addOption === true) {
			summary.addOption = true;
		}
		return summary;
	}

	const reusableBlock = typeof block.type === 'string' ? blockDefinitions.get(block.type) : null;

	if (reusableBlock && !reusableBlock.error) {
		summary.schemaKind = 'reusable-block';
		summary.reusableBlock = {
			id: reusableBlock.id,
			label: reusableBlock.label,
			path: reusableBlock.path,
			collection: reusableBlock.raw.collection === true,
			itemLabel:
				typeof reusableBlock.raw.itemLabel === 'string' ? reusableBlock.raw.itemLabel : null
		};
		summary.fields = (Array.isArray(reusableBlock.raw.blocks) ? reusableBlock.raw.blocks : [])
			.map((nestedBlock) => summarizeField(nestedBlock, blockDefinitions))
			.filter(Boolean);
		return summary;
	}

	summary.schemaKind = 'field';
	return summary;
}

export function getTentmanSchema(project, configReference) {
	if (!configReference) {
		return project.configs.map((config) => summarizeConfig(project, config));
	}

	const config = getConfigByReference(project).get(configReference);

	if (!config) {
		throw new Error(`Unknown content config reference: ${configReference}`);
	}

	const blockDefinitions = getBlockDefinitions(project);
	const content = project.contentByConfigPath.get(config.path);

	return {
		config: {
			...summarizeConfig(project, config),
			id: config.id ?? null,
			stableId: config._tentmanId ?? null,
			content: {
				mode: config.content.mode,
				path: config.content.path,
				template: config.content.template ?? null
			},
			collection:
				config.collection === true || typeof config.collection === 'object'
					? {
							enabled: true,
							itemLabel:
								typeof config.raw.itemLabel === 'string' ? config.raw.itemLabel : null,
							idField: typeof config.raw.idField === 'string' ? config.raw.idField : null,
							groups: config.groups.map((group) => ({
								label: group.label,
								value: group.value ?? null,
								stableId: group._tentmanId ?? null
							}))
						}
					: {
							enabled: false,
							itemLabel: null,
							idField: null,
							groups: []
						},
			itemCount: content?.items?.length ?? 0
		},
		fields: (Array.isArray(config.raw.blocks) ? config.raw.blocks : [])
			.map((block) => summarizeField(block, blockDefinitions))
			.filter(Boolean)
	};
}
