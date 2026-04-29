import { validateBlockAdapterValue } from '$lib/blocks/adapter-contract';
import type { BlockAdapter } from '$lib/blocks/adapters/types';
import type { DiscoveredBlockConfig } from '$lib/config/discovery';

export interface LocalBlockAdapterModule {
	adapter: BlockAdapter;
}

export interface LoadedLocalBlockAdapter {
	path: string;
	adapter: BlockAdapter;
}

export type LoadLocalBlockAdapterModule = (path: string) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getBlockContextLabel(block: DiscoveredBlockConfig): string {
	return `block "${block.id}" at ${block.path}`;
}

function normalizeJoinedPath(basePath: string, relativePath: string): string {
	const segments = [...basePath.split('/').filter(Boolean)];

	for (const segment of relativePath.split('/')) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (segments.length === 0) {
				throw new Error(`Resolved path escapes the repository root`);
			}

			segments.pop();
			continue;
		}

		segments.push(segment);
	}

	return segments.join('/');
}

export function resolveLocalBlockAdapterPath(blockConfigPath: string, adapterPath: string): string {
	const trimmedAdapterPath = adapterPath.trim();

	if (!trimmedAdapterPath) {
		throw new Error(`Adapter path must not be empty`);
	}

	const baseSegments = blockConfigPath.split('/').filter(Boolean);
	baseSegments.pop();

	return normalizeJoinedPath(baseSegments.join('/'), trimmedAdapterPath);
}

export function validateLocalBlockAdapterModule(
	moduleValue: unknown,
	block: DiscoveredBlockConfig
): BlockAdapter {
	if (!isRecord(moduleValue) || !('adapter' in moduleValue)) {
		throw new Error(
			`Adapter module for ${getBlockContextLabel(block)} must export a named "adapter"`
		);
	}

	return validateBlockAdapterValue(
		moduleValue.adapter,
		block.id,
		`Adapter export for ${getBlockContextLabel(block)}`
	);
}

export async function loadLocalBlockAdapter(
	block: DiscoveredBlockConfig,
	loadModule: LoadLocalBlockAdapterModule
): Promise<LoadedLocalBlockAdapter | null> {
	if (!block.config.adapter) {
		return null;
	}

	const resolvedPath = resolveLocalBlockAdapterPath(block.path, block.config.adapter);

	try {
		const moduleValue = await loadModule(resolvedPath);
		const adapter = validateLocalBlockAdapterModule(moduleValue, block);

		return {
			path: resolvedPath,
			adapter
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown adapter loading error';
		throw new Error(
			`Failed to load adapter for ${getBlockContextLabel(block)} from ${resolvedPath}: ${message}`
		);
	}
}
