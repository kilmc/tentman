// SERVER_JUSTIFICATION: github_proxy
import { error, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubRepository } from '$lib/server/page-context';
import type { RootConfig } from '$lib/config/root-config';

function normalizePluginsDir(rootConfig: RootConfig | null): string {
	return rootConfig?.pluginsDir?.replace(/^\.\//, '').replace(/\/+$/, '') ?? 'tentman/plugins';
}

function isSafePluginModulePath(path: string): boolean {
	return (
		!path.startsWith('/') &&
		!path.split('/').includes('..') &&
		(path.endsWith('/plugin.js') || path.endsWith('/plugin.mjs'))
	);
}

function isPathInConfiguredPluginsDir(path: string, rootConfig: RootConfig | null): boolean {
	return path.startsWith(`${normalizePluginsDir(rootConfig)}/`);
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const path = url.searchParams.get('path');

	if (!path) {
		throw error(400, 'Missing plugin module path');
	}

	if (!isSafePluginModulePath(path)) {
		throw error(400, 'Invalid plugin module path');
	}

	try {
		const { backend } = requireGitHubRepository({ locals, cookies });
		const rootConfig = await backend.readRootConfig();

		if (!isPathInConfiguredPluginsDir(path, rootConfig)) {
			throw error(400, 'Plugin module path is outside pluginsDir');
		}

		return text(await backend.readTextFile(path), {
			headers: {
				'content-type': 'text/javascript; charset=utf-8'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		handleGitHubSessionError({ cookies }, err);
		throw error(500, 'Failed to load plugin module');
	}
};
