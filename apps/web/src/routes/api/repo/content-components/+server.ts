// SERVER_JUSTIFICATION: github_proxy
import { error, json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleGitHubSessionError } from '$lib/server/auth/github';
import { requireGitHubRepository } from '$lib/server/page-context';

function normalizeRequestedPath(path: string): string {
	return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

function isSafeRequestedPath(path: string): boolean {
	return path.length > 0 && !path.startsWith('/') && !path.split('/').includes('..');
}

function isPathInContentComponentsDir(path: string): boolean {
	return path === 'src/lib/content-components' || path.startsWith('src/lib/content-components/');
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const rawPath = url.searchParams.get('path');
	const mode = url.searchParams.get('mode');

	if (!rawPath || !mode) {
		throw error(400, 'Missing content component parameters');
	}

	const path = normalizeRequestedPath(rawPath);

	if (!isSafeRequestedPath(path) || !isPathInContentComponentsDir(path)) {
		throw error(400, 'Invalid content component path');
	}

	try {
		const { backend } = requireGitHubRepository({ locals, cookies });

		if (mode === 'exists') {
			return json({ exists: await backend.fileExists(path) });
		}

		if (mode === 'list') {
			return json({ entries: await backend.listDirectory(path) });
		}

		if (mode === 'read') {
			return text(await backend.readTextFile(path), {
				headers: {
					'content-type': 'text/plain; charset=utf-8'
				}
			});
		}

		throw error(400, 'Unsupported content component mode');
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		handleGitHubSessionError({ cookies }, err);
		throw error(500, 'Failed to load content components');
	}
};
