import { buildSessionBootstrap } from '$lib/server/session-bootstrap';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => buildSessionBootstrap(locals);
