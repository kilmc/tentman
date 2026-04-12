import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import {
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE
} from '$lib/server/auth/github';
import { SELECTED_BACKEND_COOKIE, SELECTED_LOCAL_REPO_COOKIE } from '$lib/repository/selection';

function encodeSessionCookie(user: {
	login: string;
	name: string | null;
	avatar_url: string;
	email: string | null;
}) {
	return Buffer.from(
		JSON.stringify({
			v: 1,
			user
		})
	).toString('base64url');
}

function createCookies(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));

	return {
		get: vi.fn((name: string) => values.get(name)),
		set: vi.fn(),
		delete: vi.fn()
	};
}

describe('hooks.server', () => {
	it('bootstraps authenticated locals from cookies without calling GitHub', async () => {
		const cookies = createCookies({
			[GITHUB_TOKEN_COOKIE]: 'secret-token',
			[GITHUB_SESSION_COOKIE]: encodeSessionCookie({
				login: 'kilmc',
				name: 'Kilian',
				avatar_url: 'https://avatars.example/kilmc',
				email: 'kilian@example.com'
			}),
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
