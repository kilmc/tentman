import { validateBlockAdapterValue } from '$lib/blocks/adapter-contract';
import type { BlockAdapter } from '$lib/blocks/adapters/types';
import { parseBlockConfigObject, type ParsedBlockConfig } from '$lib/config/parse';
import type { BlockConfig } from '$lib/config/types';

export type PackageBlockConfig = Omit<BlockConfig, 'adapter'>;

export interface TentmanPackageBlockDefinition {
	config: PackageBlockConfig;
	adapter?: BlockAdapter;
}

export interface TentmanBlockPackage {
	blocks: TentmanPackageBlockDefinition[];
}

export interface LoadedPackageBlock {
	packageName: string;
	config: ParsedBlockConfig;
	adapter?: BlockAdapter;
}

export type SerializablePackageBlock = Omit<LoadedPackageBlock, 'adapter'> & {
	adapter?: never;
};

export type LoadBlockPackageModule = (packageName: string) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getPackageContextLabel(packageName: string): string {
	return `block package "${packageName}"`;
}

function getPackageBlockContextLabel(packageName: string, blockId: string): string {
	return `package block "${blockId}" from ${getPackageContextLabel(packageName)}`;
}

function validatePackageDefinition(
	value: unknown,
	packageName: string,
	index: number
): LoadedPackageBlock {
	if (!isRecord(value)) {
		throw new Error(
			`Block definition ${index + 1} from ${getPackageContextLabel(packageName)} must be an object`
		);
	}

	if (!('config' in value)) {
		throw new Error(
			`Block definition ${index + 1} from ${getPackageContextLabel(packageName)} must define "config"`
		);
	}

	const config = parseBlockConfigObject(value.config);
	if (config.adapter) {
		throw new Error(
			`${getPackageBlockContextLabel(packageName, config.id)} must not define config.adapter`
		);
	}

	return {
		packageName,
		config,
		...('adapter' in value && value.adapter !== undefined
			? {
					adapter: validateBlockAdapterValue(
						value.adapter,
						config.id,
						`Adapter export for ${getPackageBlockContextLabel(packageName, config.id)}`
					)
				}
			: {})
	};
}

export async function loadBlockPackage(
	packageName: string,
	loadModule: LoadBlockPackageModule
): Promise<LoadedPackageBlock[]> {
	const moduleValue = await loadModule(packageName);

	if (!isRecord(moduleValue) || !('blockPackage' in moduleValue)) {
		throw new Error(`${getPackageContextLabel(packageName)} must export a named "blockPackage"`);
	}

	const { blockPackage } = moduleValue;
	if (!isRecord(blockPackage)) {
		throw new Error(
			`Named "blockPackage" export from ${getPackageContextLabel(packageName)} must be an object`
		);
	}

	if (!Array.isArray(blockPackage.blocks)) {
		throw new Error(`${getPackageContextLabel(packageName)} must define a "blocks" array`);
	}

	return blockPackage.blocks.map((definition, index) =>
		validatePackageDefinition(definition, packageName, index)
	);
}
