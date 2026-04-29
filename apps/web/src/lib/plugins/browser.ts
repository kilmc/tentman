import { get } from 'svelte/store';
import type { RootConfig } from '$lib/config/types';
import { localRepo } from '$lib/stores/local-repo';
import {
	loadPluginRegistry,
	selectMarkdownPluginsForField,
	type PluginModuleSourceLoader
} from '$lib/plugins/registry';
import type { LoadedMarkdownPlugins, LoadedSitePlugin, SitePluginRegistry } from '$lib/plugins/types';

const pluginRegistryCache = new Map<string, Promise<SitePluginRegistry>>();

function getPluginRegistryCacheKey(
	rootConfig: RootConfig | null,
	mode: 'local' | 'github',
	scopeKey: string
): string {
	return JSON.stringify({
		mode,
		scopeKey,
		pluginsDir: rootConfig?.pluginsDir ?? null,
		plugins: rootConfig?.plugins ?? []
	});
}

function createGitHubPluginSourceLoader(): PluginModuleSourceLoader {
	return {
		async loadSource(path: string) {
			const response = await fetch(`/api/repo/plugin-module?path=${encodeURIComponent(path)}`);

			if (!response.ok) {
				throw new Error(`Failed to load plugin source at ${path} (${response.status})`);
			}

			return response.text();
		}
	};
}

function createLocalPluginSourceLoader(): PluginModuleSourceLoader {
	const backend = get(localRepo).backend;

	if (!backend) {
		throw new Error('No local repository backend is available for plugin loading');
	}

	return {
		async loadSource(path: string) {
			try {
				return await backend.readTextFile(path);
			} catch {
				throw new Error(`Failed to load plugin source at ${path}`);
			}
		}
	};
}

function getSourceLoader(mode: 'local' | 'github'): PluginModuleSourceLoader {
	return mode === 'local' ? createLocalPluginSourceLoader() : createGitHubPluginSourceLoader();
}

export async function loadRegisteredPluginsForMode(
	rootConfig: RootConfig | null,
	mode: 'local' | 'github',
	options: { scopeKey?: string } = {}
): Promise<LoadedSitePlugin[]> {
	return (await loadPluginRegistryForMode(rootConfig, mode, options)).plugins;
}

export async function loadMarkdownPluginsForMode(
	field: { id: string; type: string; plugins?: string[] },
	rootConfig: RootConfig | null,
	mode: 'local' | 'github',
	options: { scopeKey?: string } = {}
): Promise<LoadedMarkdownPlugins> {
	if ((field.plugins?.length ?? 0) === 0) {
		return {
			plugins: [],
			extensions: [],
			toolbarItems: [],
			errors: []
		};
	}

	return selectMarkdownPluginsForField(
		field,
		await loadPluginRegistryForMode(rootConfig, mode, options)
	);
}

export async function loadPluginRegistryForMode(
	rootConfig: RootConfig | null,
	mode: 'local' | 'github',
	options: { scopeKey?: string } = {}
): Promise<SitePluginRegistry> {
	const scopeKey = options.scopeKey ?? mode;
	const cacheKey = getPluginRegistryCacheKey(rootConfig, mode, scopeKey);
	let cachedRegistry = pluginRegistryCache.get(cacheKey);

	if (!cachedRegistry) {
		cachedRegistry = loadPluginRegistry(rootConfig, getSourceLoader(mode));
		pluginRegistryCache.set(cacheKey, cachedRegistry);
	}

	return cachedRegistry;
}

export function clearPluginRegistryCache(): void {
	pluginRegistryCache.clear();
}
