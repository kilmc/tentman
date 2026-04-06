// SERVER_JUSTIFICATION: session
import { redirect, error } from '@sveltejs/kit';
import type { Actions } from './$types';
import { SELECTED_BACKEND_COOKIE, SELECTED_LOCAL_REPO_COOKIE } from '$lib/repository/selection';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import {
	createGitHubServerClient,
	handleGitHubSessionError,
	persistSelectedGitHubRepository
} from '$lib/server/auth/github';

export const actions = {
	select: async ({ request, cookies, locals }) => {
		if (!locals.isAuthenticated || !locals.githubToken) {
			throw error(401, 'Unauthorized');
		}

		const formData = await request.formData();
		const owner = formData.get('owner');
		const name = formData.get('name');

		if (!owner || !name) {
			throw error(400, 'Missing repository information');
		}

		const selectedRepo = {
			owner: owner.toString(),
			name: name.toString(),
			full_name: `${owner}/${name}`
		};

		const octokit = createGitHubServerClient(locals.githubToken, cookies);
		let rootConfig = null;

		try {
			rootConfig = await createGitHubRepositoryBackend(octokit, selectedRepo).readRootConfig();
		} catch (err) {
			handleGitHubSessionError({ cookies }, err, { redirectTo: '/repos' });
			console.error('Failed to load repository root config:', err);
		}

		persistSelectedGitHubRepository(cookies, selectedRepo, rootConfig);
		cookies.set(SELECTED_BACKEND_COOKIE, 'github', {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
		cookies.delete(SELECTED_LOCAL_REPO_COOKIE, { path: '/' });

		throw redirect(302, '/pages');
	}
} satisfies Actions;
