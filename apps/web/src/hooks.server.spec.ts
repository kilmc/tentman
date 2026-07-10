import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import { GITHUB_REPO_SESSION_COOKIE, persistGitHubSession } from '$lib/server/auth/github';
import { SELECTED_BACKEND_COOKIE, SELECTED_LOCAL_REPO_COOKIE } from '$lib/repository/selection';

function createCookies(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));

	return {
		values,
		get: vi.fn((name: string) => values.get(name)),
		set: vi.fn((name: string, value: string) => {
			values.set(name, value);
		}),
		delete: vi.fn((name: string) => {
			values.delete(name);
		})
	};
}

describe('hooks.server', () => {
	it('bootstraps authenticated locals from cookies without calling GitHub', async () => {
		const cookies = createCookies({
			[GITHUB_REPO_SESSION_COOKIE]: Buffer.from(
				JSON.stringify({
					v: 1,
					selectedRepoConfigSummary: {
						siteName: 'Acme Docs'
					}
				})
			).toString('base64url'),
			selected_repo:
				'{"owner":"acme","name":"repo","full_name":"acme/repo","default_branch":"trunk"}',
			[SELECTED_BACKEND_COOKIE]: 'github'
		});
		persistGitHubSession(cookies, {
			token: 'secret-token',
			user: {
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			}
		});

		let resolvedLocals: App.Locals | undefined;
		const resolve = vi.fn(async (event: { locals: App.Locals }) => {
			resolvedLocals = event.locals;
			return new Response('ok');
		});

		const response = await handle({
			event: {
				cookies,
				locals: {}
			} as never,
			resolve
		});

		expect(resolve).toHaveBeenCalledOnce();
		expect(resolvedLocals).toMatchObject({
			isAuthenticated: true,
			githubToken: 'secret-token',
			user: {
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			},
			selectedRepoConfigSummary: {
				siteName: 'Acme Docs'
			},
			selectedRepo: {
				owner: 'acme',
				name: 'repo',
				full_name: 'acme/repo',
				default_branch: 'trunk'
			},
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'repo',
					full_name: 'acme/repo',
					default_branch: 'trunk'
				}
			}
		});
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
		expect(response.headers.get('Content-Security-Policy')).toContain(
			"media-src 'self' blob: https:"
		);
	});

	it('keeps local backend selection when the local repo cookie is present', async () => {
		const cookies = createCookies({
			[SELECTED_BACKEND_COOKIE]: 'local',
			[SELECTED_LOCAL_REPO_COOKIE]: '{"name":"Docs","pathLabel":"~/Sites/docs"}',
			[GITHUB_REPO_SESSION_COOKIE]: Buffer.from(
				JSON.stringify({
					v: 1,
					selectedRepoConfigSummary: {
						siteName: 'Acme Docs'
					}
				})
			).toString('base64url'),
			selected_repo:
				'{"owner":"acme","name":"repo","full_name":"acme/repo","default_branch":"trunk"}'
		});

		let resolvedLocals: App.Locals | undefined;
		const resolve = vi.fn(async (event: { locals: App.Locals }) => {
			resolvedLocals = event.locals;
			return new Response('ok');
		});

		await handle({
			event: {
				cookies,
				locals: {}
			} as never,
			resolve
		});

		expect(resolvedLocals).toMatchObject({
			isAuthenticated: false,
			selectedBackend: {
				kind: 'local',
				repo: {
					name: 'Docs',
					pathLabel: '~/Sites/docs'
				}
			}
		});
		expect(resolvedLocals?.selectedRepo).toBeUndefined();
		expect(resolvedLocals?.selectedRepoConfigSummary).toBeUndefined();
	});

	it('ignores a stale GitHub repo cookie when no backend is selected', async () => {
		const cookies = createCookies({
			[GITHUB_REPO_SESSION_COOKIE]: Buffer.from(
				JSON.stringify({
					v: 1,
					selectedRepoConfigSummary: {
						siteName: 'Acme Docs'
					}
				})
			).toString('base64url'),
			selected_repo:
				'{"owner":"acme","name":"repo","full_name":"acme/repo","default_branch":"trunk"}'
		});

		let resolvedLocals: App.Locals | undefined;
		const resolve = vi.fn(async (event: { locals: App.Locals }) => {
			resolvedLocals = event.locals;
			return new Response('ok');
		});

		await handle({
			event: {
				cookies,
				locals: {}
			} as never,
			resolve
		});

		expect(resolvedLocals).toMatchObject({
			isAuthenticated: false
		});
		expect(resolvedLocals?.selectedBackend).toBeUndefined();
		expect(resolvedLocals?.selectedRepo).toBeUndefined();
		expect(resolvedLocals?.selectedRepoConfigSummary).toBeUndefined();
	});
});
