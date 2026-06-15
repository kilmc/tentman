import type { Plugin } from 'vite';

export interface TentmanContentComponentReloadOptions {
	componentsDir?: string;
}

export function tentmanContentComponentReload(
	options?: TentmanContentComponentReloadOptions
): Plugin;

