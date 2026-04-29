// SERVER_JUSTIFICATION: session
import { error, json } from '@sveltejs/kit';
import { buildSessionBootstrap } from '$lib/server/session-bootstrap';
import {
	clearActiveBackendSelection,
	persistLocalBackendSelection
} from '$lib/server/backend-selection';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import type { RequestHandler } from './$types';

function isLocalRepoPayload(value: unknown): value is {
	kind: 'local';
	repo: {
		name: string;
		pathLabel: string;
	};
} {
	if (!value || typeof value !== 'object') {
		return false;
	}

	if (!('kind' in value) || value.kind !== 'local') {
		return false;
	}

	if (!('repo' in value) || !value.repo || typeof value.repo !== 'object') {
		return false;
	}

	return (
		'name' in value.repo &&
		typeof value.repo.name === 'string' &&
		'pathLabel' in value.repo &&
		typeof value.repo.pathLabel === 'string'
	);
}

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const body = (await request.json()) as unknown;

	if (isLocalRepoPayload(body)) {
		persistLocalBackendSelection(cookies, body.repo);
		logDevRouting('api:backend-selection:local', {
			repo: body.repo.pathLabel
		});

		return json({
			...buildSessionBootstrap({
				...locals,
				selectedBackend: {
					kind: 'local',
					repo: body.repo
				},
				selectedRepo: undefined,
				rootConfig: null
			}),
			selectionCommitted: true
		});
	}

	if (body && typeof body === 'object' && 'kind' in body && body.kind === 'none') {
		clearActiveBackendSelection(cookies);
		logDevRouting('api:backend-selection:cleared');

		return json({
			...buildSessionBootstrap({
				...locals,
				selectedBackend: undefined,
				selectedRepo: undefined,
				rootConfig: null
			}),
			selectionCommitted: true
		});
	}

	throw error(400, 'Invalid backend selection payload');
};
