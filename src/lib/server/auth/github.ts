import { error as httpError, redirect, type Cookies } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import type { RootConfig } from '$lib/config/root-config';
import type {
	GitHubRootConfigSnapshot,
	GitHubUserSnapshot
} from '$lib/auth/session';
import { SELECTED_BACKEND_COOKIE } from '$lib/repository/selection';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';

export const GITHUB_TOKEN_COOKIE = 'github_token';
export const GITHUB_SESSION_COOKIE = 'github_session';
export const GITHUB_REPO_SESSION_COOKIE = 'github_repo_session';
export const SELECTED_REPO_COOKIE = 'selected_repo';

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

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

export function getGitHubClientId(): string {
	const clientId = process.env.GITHUB_CLIENT_ID?.trim();

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
	const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

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

export function getGitHubCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax' as const,
		maxAge: SESSION_COOKIE_MAX_AGE
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
	cookies: Pick<Cookies, 'set' | 'delete'>,
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

export function clearGitHubSession(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(GITHUB_TOKEN_COOKIE, { path: '/' });
	cookies.delete(GITHUB_SESSION_COOKIE, { path: '/' });
	cookies.delete(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
	cookies.delete(SELECTED_REPO_COOKIE, { path: '/' });
	cookies.delete(SELECTED_BACKEND_COOKIE, { path: '/' });
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
		throw redirect(302, `/auth/login?redirect=${options.redirectTo}`);
	}

	throw httpError(401, 'GitHub session expired. Please log in again.');
}
