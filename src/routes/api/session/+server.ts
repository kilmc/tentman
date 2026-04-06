// SERVER_JUSTIFICATION: session
import { json } from '@sveltejs/kit';
import { normalizeSessionBootstrap } from '$lib/auth/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	return json(
		normalizeSessionBootstrap({
			isAuthenticated: locals.isAuthenticated,
			user: locals.user ?? null,
			selectedRepo: locals.selectedRepo ?? null,
			selectedBackend: locals.selectedBackend ?? null,
			rootConfig: locals.rootConfig ?? null
		})
	);
};
