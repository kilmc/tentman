import { browser, dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	loadRepoConfigsBootstrap
} from '$lib/repository/config-bootstrap';
import { clearLastRoutingFailure, writeLastRoutingFailure } from '$lib/utils/dev-routing-browser';
import { logDevRouting } from '$lib/utils/dev-routing-log';
import { buildPathWithQuery, buildReposReturnHref } from '$lib/utils/routing';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, depends, parent }) => {
	const parentData = await parent();

	logDevRouting('pages-layout:parent', {
		isAuthenticated: parentData.isAuthenticated,
		selectedBackend: parentData.selectedBackend?.kind ?? null,
		selectedRepo: parentData.selectedRepo?.full_name ?? null
	});

	if (
		parentData.selectedBackend?.kind === 'local' ||
		!parentData.isAuthenticated ||
		!parentData.selectedRepo
	) {
		return {
			...EMPTY_REPO_CONFIGS_BOOTSTRAP
		};
	}

	depends('app:repo-configs');

	try {
		const bootstrap = await loadRepoConfigsBootstrap(fetch);
		if (browser && dev) {
			clearLastRoutingFailure();
		}
		logDevRouting('pages-layout:bootstrap-success', {
			selectedRepo: parentData.selectedRepo.full_name,
			configCount: bootstrap.configs.length
		});
		return bootstrap;
	} catch (error) {
		if (browser && dev) {
			writeLastRoutingFailure({
				source: 'pages-layout',
				selectedRepo: parentData.selectedRepo.full_name,
				status: error && typeof error === 'object' && 'status' in error ? error.status : null,
				message: error instanceof Error ? error.message : 'Unknown error'
			});
		}
		logDevRouting('pages-layout:bootstrap-error', {
			selectedRepo: parentData.selectedRepo.full_name,
			status: error && typeof error === 'object' && 'status' in error ? error.status : null,
			message: error instanceof Error ? error.message : 'Unknown error'
		});
		if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
			throw redirect(
				302,
				dev
					? buildPathWithQuery('/repos', {
							returnTo: '/pages',
							debugFailure: 'pages-layout-bootstrap-401',
							debugRepo: parentData.selectedRepo.full_name
						})
					: buildReposReturnHref('/repos', '/pages')
			);
		}

		throw error;
	}
};
