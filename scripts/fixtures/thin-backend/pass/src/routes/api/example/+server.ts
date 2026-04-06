// SERVER_JUSTIFICATION: github_proxy
import { json } from '@sveltejs/kit';

export const GET = async () => json({ ok: true });
