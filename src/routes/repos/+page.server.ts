import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isAuthenticated || !locals.octokit) {
		throw redirect(302, '/auth/login?redirect=/repos');
	}

	try {
		// Fetch user's repositories
		const { data: repos } = await locals.octokit.rest.repos.listForAuthenticatedUser({
			sort: 'updated',
			per_page: 100
		});

		return {
			repos: repos.map((repo) => ({
				id: repo.id,
				name: repo.name,
				full_name: repo.full_name,
				owner: repo.owner.login,
				description: repo.description,
				private: repo.private,
				updated_at: repo.updated_at
			}))
		};
	} catch (err) {
		console.error('Failed to fetch repositories:', err);
		throw error(500, 'Failed to load repositories');
	}
};

export const actions = {
	select: async ({ request, cookies, locals }) => {
		if (!locals.isAuthenticated) {
			throw error(401, 'Unauthorized');
		}

		const formData = await request.formData();
		const owner = formData.get('owner');
		const name = formData.get('name');

		if (!owner || !name) {
			throw error(400, 'Missing repository information');
		}

		// Store selected repository in cookie
		const selectedRepo = {
			owner: owner.toString(),
			name: name.toString(),
			full_name: `${owner}/${name}`
		};

		cookies.set('selected_repo', JSON.stringify(selectedRepo), {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		throw redirect(302, '/pages');
	}
} satisfies Actions;
