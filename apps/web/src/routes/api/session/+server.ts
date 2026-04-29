// SERVER_JUSTIFICATION: session
import { json } from '@sveltejs/kit';
import { buildSessionBootstrap } from '$lib/server/session-bootstrap';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const bootstrap = buildSessionBootstrap(locals);

	logDevRouting('api:session', {
		isAuthenticated: bootstrap.isAuthenticated,
		selectedBackend: bootstrap.selectedBackend?.kind ?? null,
		selectedRepo: bootstrap.selectedRepo?.full_name ?? null
	});

	return json(bootstrap);
};
