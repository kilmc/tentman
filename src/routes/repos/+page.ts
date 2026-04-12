import { error as httpError, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch, depends }) => {
	const parentData = await parent();

	if (!parentData.isAuthenticated) {
		return {
			repos: [],
			recentRepos: parentData.recentRepos ?? [],
			githubAuthenticated: false as const
		};
	}

	depends('app:repos');

	const response = await fetch('/api/repos');

	if (response.status === 401) {
		return {
			repos: [],
			recentRepos: parentData.recentRepos ?? [],
			githubAuthenticated: false as const
		};
	}

	if (!response.ok) {
		throw httpError(response.status, 'Failed to load repositories');
	}

	return {
		...((await response.json()) as Awaited<ReturnType<Response['json']>>),
		recentRepos: parentData.recentRepos ?? [],
		githubAuthenticated: true as const
	};
};
