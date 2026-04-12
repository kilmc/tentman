import { error as httpError, redirect, type Cookies } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { Octokit } from 'octokit';
import type { RootConfig } from '$lib/config/root-config';
import type {
	GitHubRootConfigSnapshot,
	GitHubUserSnapshot,
	RecentGitHubRepositorySnapshot
} from '$lib/auth/session';
import { SELECTED_BACKEND_COOKIE } from '$lib/repository/selection';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import { buildPathWithQuery, sanitizeAuthRedirectTarget } from '$lib/utils/routing';

export const GITHUB_TOKEN_COOKIE = 'github_token';
export const GITHUB_SESSION_COOKIE = 'github_session';
export const GITHUB_REPO_SESSION_COOKIE = 'github_repo_session';
export const SELECTED_REPO_COOKIE = 'selected_repo';
export const RECENT_REPOS_COOKIE = 'recent_github_repos';
export const GITHUB_LOGIN_COOLDOWN_COOKIE = 'github_login_cooldown';
export const GITHUB_OAUTH_STATE_COOKIE = 'github_oauth_state';
export const GITHUB_OAUTH_REDIRECT_COOKIE = 'github_oauth_redirect';

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const MAX_RECENT_REPOS = 5;
const LOGIN_COOLDOWN_MAX_AGE = 15;
const OAUTH_REQUEST_MAX_AGE = 60 * 10;

interface GitHubSessionSnapshot {
	v: 1;
	user: GitHubUserSnapshot;
}

interface GitHubSessionPayload {
	token: string;
	user: GitHubUserSnapshot;
}

interface GitHubRepoSessionSnapshot {
	v: 1;
	rootConfig: GitHubRootConfigSnapshot | null;
}

interface CookieTarget {
	cookies: Pick<Cookies, 'delete'>;
}

function isGitHubRepositoryIdentity(value: unknown): value is GitHubRepositoryIdentity {
	if (!value || typeof value !== 'object') {
		return false;
	}

	return (
		'owner' in value &&
		typeof value.owner === 'string' &&
		'name' in value &&
		typeof value.name === 'string' &&
		'full_name' in value &&
		typeof value.full_name === 'string'
	);
}

function isRecentGitHubRepositorySnapshot(value: unknown): value is RecentGitHubRepositorySnapshot {
	return (
		isGitHubRepositoryIdentity(value) && 'openedAt' in value && typeof value.openedAt === 'string'
	);
}

export function isGitHubOAuthConfigured(): boolean {
	return Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim());
}

export function getGitHubClientId(): string {
	const clientId = env.GITHUB_CLIENT_ID?.trim();

	if (!clientId) {
		throw httpError(
			503,
			'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_ID.'
		);
	}

	return clientId;
}

export function getGitHubOAuthCredentials(): {
	clientId: string;
	clientSecret: string;
} {
	const clientId = getGitHubClientId();
	const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();

	if (!clientSecret) {
		throw httpError(
			503,
			'GitHub OAuth is not configured for this deployment. Set GITHUB_CLIENT_SECRET.'
		);
	}

	return {
		clientId,
		clientSecret
	};
}

export function getGitHubCookieOptions(
	overrides: Partial<{
		maxAge: number;
		httpOnly: boolean;
		secure: boolean;
		sameSite: 'lax' | 'strict' | 'none';
		path: string;
	}> = {}
) {
	return {
		path: '/',
		httpOnly: true,
		secure: env.NODE_ENV === 'production',
		sameSite: 'lax' as const,
		maxAge: SESSION_COOKIE_MAX_AGE,
		...overrides
	};
}

function encodeSessionSnapshot(snapshot: GitHubSessionSnapshot): string {
	return Buffer.from(JSON.stringify(snapshot)).toString('base64url');
}

function encodeRepoSessionSnapshot(snapshot: GitHubRepoSessionSnapshot): string {
	return Buffer.from(JSON.stringify(snapshot)).toString('base64url');
}

function decodeSessionSnapshot(value: string): GitHubSessionSnapshot | null {
	try {
		const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as GitHubSessionSnapshot;
		if (parsed?.v !== 1 || !parsed.user?.login || !parsed.user.avatar_url) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function decodeRepoSessionSnapshot(value: string): GitHubRepoSessionSnapshot | null {
	try {
		const parsed = JSON.parse(
			Buffer.from(value, 'base64url').toString()
		) as GitHubRepoSessionSnapshot;
		if (parsed?.v !== 1 || !('rootConfig' in parsed)) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

export function persistGitHubSession(
	cookies: Pick<Cookies, 'set'>,
	session: GitHubSessionPayload
): void {
	const options = getGitHubCookieOptions();

	cookies.set(GITHUB_TOKEN_COOKIE, session.token, options);
	cookies.set(
		GITHUB_SESSION_COOKIE,
		encodeSessionSnapshot({
			v: 1,
			user: session.user
		}),
		options
	);
}

export function readGitHubSession(cookies: Pick<Cookies, 'get'>): {
	token?: string;
	user?: GitHubUserSnapshot;
} {
	const token = cookies.get(GITHUB_TOKEN_COOKIE);
	const rawSession = cookies.get(GITHUB_SESSION_COOKIE);
	const snapshot = rawSession ? decodeSessionSnapshot(rawSession) : null;

	return {
		...(token ? { token } : {}),
		...(snapshot?.user ? { user: snapshot.user } : {})
	};
}

export function persistSelectedGitHubRepository(
	cookies: Pick<Cookies, 'get' | 'set' | 'delete'>,
	repository: GitHubRepositoryIdentity,
	rootConfig: RootConfig | null
): void {
	const options = getGitHubCookieOptions();
	const rootConfigSnapshot: GitHubRootConfigSnapshot | null = rootConfig
		? {
				...(rootConfig.siteName ? { siteName: rootConfig.siteName } : {})
			}
		: null;

	cookies.set(SELECTED_REPO_COOKIE, JSON.stringify(repository), options);
	cookies.set(
		GITHUB_REPO_SESSION_COOKIE,
		encodeRepoSessionSnapshot({
			v: 1,
			rootConfig: rootConfigSnapshot
		}),
		options
	);
	persistRecentGitHubRepository(cookies, repository);
}

export function readSelectedGitHubRepositorySession(cookies: Pick<Cookies, 'get'>): {
	rootConfig: GitHubRootConfigSnapshot | null;
} {
	const rawSession = cookies.get(GITHUB_REPO_SESSION_COOKIE);
	const snapshot = rawSession ? decodeRepoSessionSnapshot(rawSession) : null;

	return {
		rootConfig: snapshot?.rootConfig ?? null
	};
}

export function persistRecentGitHubRepository(
	cookies: Pick<Cookies, 'get' | 'set'>,
	repository: GitHubRepositoryIdentity
): void {
	const recentRepos = readRecentGitHubRepositories(cookies);
	const nextRecentRepos = [
		{
			...repository,
			openedAt: new Date().toISOString()
		},
		...recentRepos.filter((entry) => entry.full_name !== repository.full_name)
	].slice(0, MAX_RECENT_REPOS);

	cookies.set(RECENT_REPOS_COOKIE, JSON.stringify(nextRecentRepos), getGitHubCookieOptions());
}

export function readRecentGitHubRepositories(
	cookies: Pick<Cookies, 'get'>
): RecentGitHubRepositorySnapshot[] {
	const rawValue = cookies.get(RECENT_REPOS_COOKIE);

	if (!rawValue) {
		return [];
	}

	try {
		const parsed = JSON.parse(rawValue) as unknown;

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(isRecentGitHubRepositorySnapshot);
	} catch {
		return [];
	}
}

export function clearGitHubSession(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(GITHUB_TOKEN_COOKIE, { path: '/' });
	cookies.delete(GITHUB_SESSION_COOKIE, { path: '/' });
	cookies.delete(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
	cookies.delete(SELECTED_REPO_COOKIE, { path: '/' });
	cookies.delete(SELECTED_BACKEND_COOKIE, { path: '/' });
	cookies.delete(RECENT_REPOS_COOKIE, { path: '/' });
	cookies.delete(GITHUB_LOGIN_COOLDOWN_COOKIE, { path: '/' });
	clearGitHubOAuthRequest(cookies);
}

export function markGitHubLoginAttempt(cookies: Pick<Cookies, 'set'>): void {
	cookies.set(
		GITHUB_LOGIN_COOLDOWN_COOKIE,
		'1',
		getGitHubCookieOptions({ maxAge: LOGIN_COOLDOWN_MAX_AGE })
	);
}

export function hasRecentGitHubLoginAttempt(cookies: Pick<Cookies, 'get'>): boolean {
	return cookies.get(GITHUB_LOGIN_COOLDOWN_COOKIE) === '1';
}

export function createGitHubOAuthState(): string {
	return randomBytes(32).toString('hex');
}

export function persistGitHubOAuthRequest(
	cookies: Pick<Cookies, 'set'>,
	request: {
		state: string;
		redirectTo: string;
	}
): void {
	const options = getGitHubCookieOptions({ maxAge: OAUTH_REQUEST_MAX_AGE });

	cookies.set(GITHUB_OAUTH_STATE_COOKIE, request.state, options);
	cookies.set(
		GITHUB_OAUTH_REDIRECT_COOKIE,
		sanitizeAuthRedirectTarget(request.redirectTo, '/repos'),
		options
	);
}

export function readGitHubOAuthRequest(cookies: Pick<Cookies, 'get'>): {
	state: string | null;
	redirectTo: string;
} {
	return {
		state: cookies.get(GITHUB_OAUTH_STATE_COOKIE) ?? null,
		redirectTo: sanitizeAuthRedirectTarget(cookies.get(GITHUB_OAUTH_REDIRECT_COOKIE), '/repos')
	};
}

export function clearGitHubOAuthRequest(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(GITHUB_OAUTH_STATE_COOKIE, { path: '/' });
	cookies.delete(GITHUB_OAUTH_REDIRECT_COOKIE, { path: '/' });
}

export function isGitHubUnauthorizedError(value: unknown): boolean {
	if (!value || typeof value !== 'object') {
		return false;
	}

	if ('status' in value && value.status === 401) {
		return true;
	}

	if ('message' in value && typeof value.message === 'string') {
		return value.message.toLowerCase().includes('bad credentials');
	}

	return false;
}

export function createGitHubServerClient(token: string, cookies: Pick<Cookies, 'delete'>): Octokit {
	const octokit = new Octokit({ auth: token });

	octokit.hook.error('request', async (error) => {
		if (isGitHubUnauthorizedError(error)) {
			clearGitHubSession(cookies);
		}

		throw error;
	});

	return octokit;
}

export function handleGitHubSessionError(
	target: CookieTarget,
	value: unknown,
	options?: { redirectTo?: string }
): never | void {
	if (!isGitHubUnauthorizedError(value)) {
		return;
	}

	clearGitHubSession(target.cookies);

	if (options?.redirectTo) {
		throw redirect(
			302,
			buildPathWithQuery('/repos', {
				returnTo: sanitizeAuthRedirectTarget(options.redirectTo, '/repos')
			})
		);
	}

	throw httpError(401, 'GitHub session expired. Please log in again.');
}
