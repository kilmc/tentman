import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	readRootConfig: vi.fn(),
	createGitHubServerClient: vi.fn(() => ({ kind: 'octokit' })),
	handleGitHubSessionError: vi.fn(),
	persistSelectedGitHubRepository: vi.fn()
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn(() => ({
		readRootConfig: mocks.readRootConfig
	}))
}));

vi.mock('$lib/server/auth/github', () => ({
	createGitHubServerClient: mocks.createGitHubServerClient,
	handleGitHubSessionError: mocks.handleGitHubSessionError,
	persistSelectedGitHubRepository: mocks.persistSelectedGitHubRepository
}));

import { actions } from './+page.server';

function createCookies() {
	return {
		set: vi.fn(),
		delete: vi.fn()
	};
}

describe('routes/repos/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.readRootConfig.mockResolvedValue(null);
	});

	it('redirects successful repo selection with 303 to the requested return target', async () => {
		const cookies = createCookies();

		await expect(
			actions.select({
				request: new Request('http://localhost/repos?/select', {
					method: 'POST',
					body: new URLSearchParams({
						owner: 'acme',
						name: 'docs'
					})
				}),
				cookies,
				locals: {
					isAuthenticated: true,
					githubToken: 'secret-token'
				},
				url: new URL('http://localhost/repos?returnTo=%2Fpages%2Fposts')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts'
		});

		expect(mocks.createGitHubServerClient).toHaveBeenCalledWith('secret-token', cookies);
		expect(mocks.persistSelectedGitHubRepository).toHaveBeenCalledWith(
			cookies,
			{
				owner: 'acme',
				name: 'docs',
				full_name: 'acme/docs'
			},
			null
		);
		expect(cookies.set).toHaveBeenCalledWith(
			'selected_backend_kind',
			'github',
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			})
		);
		expect(cookies.delete).toHaveBeenCalledWith('selected_local_repo', { path: '/' });
	});

	it('falls back to /pages when returnTo is missing or unsafe', async () => {
		const cookies = createCookies();

		await expect(
			actions.select({
				request: new Request('http://localhost/repos?/select', {
					method: 'POST',
					body: new URLSearchParams({
						owner: 'acme',
						name: 'docs'
					})
				}),
				cookies,
				locals: {
					isAuthenticated: true,
					githubToken: 'secret-token'
				},
				url: new URL('http://localhost/repos?returnTo=https://example.com/elsewhere')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages'
		});
	});

	it('keeps the selection flow alive when reading the root config fails without auth expiry', async () => {
		const cookies = createCookies();
		const rootConfigError = new Error('No .tentman.json in this repo');
		mocks.readRootConfig.mockRejectedValue(rootConfigError);

		await expect(
			actions.select({
				request: new Request('http://localhost/repos?/select', {
					method: 'POST',
					body: new URLSearchParams({
						owner: 'acme',
						name: 'docs'
					})
				}),
				cookies,
				locals: {
					isAuthenticated: true,
					githubToken: 'secret-token'
				},
				url: new URL('http://localhost/repos')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages'
		});

		expect(mocks.handleGitHubSessionError).toHaveBeenCalledWith({ cookies }, rootConfigError, {
			redirectTo: '/repos'
		});
		expect(mocks.persistSelectedGitHubRepository).toHaveBeenCalledOnce();
	});
});
