import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import {
	GITHUB_REPO_SESSION_COOKIE,
	persistGitHubSession
} from '$lib/server/auth/github';
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
					rootConfig: {
						siteName: 'Acme Docs'
					}
				})
			).toString('base64url'),
			selected_repo: '{"owner":"acme","name":"repo","full_name":"acme/repo"}',
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

		await handle({
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
			rootConfig: {
				siteName: 'Acme Docs'
			},
			selectedRepo: {
				owner: 'acme',
				name: 'repo',
				full_name: 'acme/repo'
			},
			selectedBackend: {
				kind: 'github',
				repo: {
					owner: 'acme',
					name: 'repo',
					full_name: 'acme/repo'
				}
			}
		});
	});

	it('keeps local backend selection when the local repo cookie is present', async () => {
		const cookies = createCookies({
			[SELECTED_BACKEND_COOKIE]: 'local',
			[SELECTED_LOCAL_REPO_COOKIE]: '{"name":"Docs","pathLabel":"~/Sites/docs"}',
			[GITHUB_REPO_SESSION_COOKIE]: Buffer.from(
				JSON.stringify({
					v: 1,
					rootConfig: {
						siteName: 'Acme Docs'
					}
				})
			).toString('base64url'),
			selected_repo: '{"owner":"acme","name":"repo","full_name":"acme/repo"}'
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
		expect(resolvedLocals?.rootConfig).toBeUndefined();
	});
});
