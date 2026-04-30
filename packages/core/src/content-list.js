import {
	getConfigByReference,
	getConfigReferences,
	getItemReferences,
	getPrimaryConfigReference,
	getPrimaryItemReference
} from './references.js';

function getConfigKind(config) {
	return config.collection === true || typeof config.collection === 'object' ? 'collection' : 'singleton';
}

function summarizeConfig(project, config) {
	const content = project.contentByConfigPath.get(config.path);

	return {
		label: config.label,
		kind: getConfigKind(config),
		path: config.path,
		contentMode: config.content.mode,
		contentPath: content?.path ?? config.content.path,
		contentExists: content?.exists ?? false,
		reference: getPrimaryConfigReference(config) ?? null,
		references: getConfigReferences(config),
		itemCount: content?.items?.length ?? 0
	};
}

function summarizeItem(item, index) {
	return {
		label: item.title ?? item.label ?? item.slug ?? item.filename ?? String(index + 1),
		reference: getPrimaryItemReference(item) ?? null,
		references: getItemReferences(item),
		path: item.__tentmanSourcePath ?? null,
		index
	};
}

export function listTentmanContent(project, configReference) {
	if (!configReference) {
		return project.configs.map((config) => {
			return summarizeConfig(project, config);
		});
	}

	const config = getConfigByReference(project).get(configReference);

	if (!config) {
		throw new Error(`Unknown content config reference: ${configReference}`);
	}

	const content = project.contentByConfigPath.get(config.path);

	return {
		config: {
			...summarizeConfig(project, config)
		},
		items: (content?.items ?? []).map((item, index) => summarizeItem(item, index))
	};
}
