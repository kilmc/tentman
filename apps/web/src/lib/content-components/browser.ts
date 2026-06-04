import { get } from 'svelte/store';
import { localRepo } from '$lib/stores/local-repo';
import {
	loadContentComponentRegistryFromRepository,
	type ContentComponentRegistry
} from './registry';

const contentComponentRegistryCache = new Map<string, Promise<ContentComponentRegistry>>();

function createGitHubLoader() {
	return {
		async fileExists(path: string) {
			const response = await fetch(
				`/api/repo/content-components?path=${encodeURIComponent(path)}&mode=exists`
			);
			if (!response.ok) {
				throw new Error(`Failed to probe content components directory (${response.status})`);
			}

			const payload = (await response.json()) as { exists: boolean };
			return payload.exists;
		},

		async listDirectory(path: string) {
			const response = await fetch(
				`/api/repo/content-components?path=${encodeURIComponent(path)}&mode=list`
			);
			if (!response.ok) {
				throw new Error(`Failed to list content components directory (${response.status})`);
			}

			const payload = (await response.json()) as {
				entries: Array<{ name: string; path: string; kind: 'file' | 'directory' }>;
			};
			return payload.entries;
		},

		async readTextFile(path: string) {
			const response = await fetch(
				`/api/repo/content-components?path=${encodeURIComponent(path)}&mode=read`
			);
			if (!response.ok) {
				throw new Error(`Failed to load content component file at ${path} (${response.status})`);
			}

			return response.text();
		}
	};
}

function createLocalLoader() {
	const backend = get(localRepo).backend;

	if (!backend) {
		throw new Error('No local repository backend is available for content component loading');
	}

	return {
		fileExists(path: string) {
			return backend.fileExists(path);
		},
		listDirectory(path: string) {
			return backend.listDirectory(path);
		},
		readTextFile(path: string) {
			return backend.readTextFile(path);
		}
	};
}

function getRegistryCacheKey(mode: 'local' | 'github', scopeKey: string): string {
	return JSON.stringify({ mode, scopeKey });
}

export async function loadContentComponentRegistryForMode(
	mode: 'local' | 'github',
	options: { scopeKey?: string; componentsDir?: string } = {}
): Promise<ContentComponentRegistry> {
	const scopeKey = options.scopeKey ?? mode;
	const cacheKey = getRegistryCacheKey(
		mode,
		JSON.stringify([scopeKey, options.componentsDir ?? null])
	);
	let cached = contentComponentRegistryCache.get(cacheKey);

	if (!cached) {
		cached = loadContentComponentRegistryFromRepository(
			mode === 'local' ? createLocalLoader() : createGitHubLoader(),
			{
				componentsDir: options.componentsDir,
				onError: 'warn'
			}
		);
		contentComponentRegistryCache.set(cacheKey, cached);
	}

	return cached;
}

export function clearContentComponentRegistryCache(): void {
	contentComponentRegistryCache.clear();
}
