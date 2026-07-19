import { error as httpError, redirect, type Cookies } from '@sveltejs/kit';
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';
import { env } from '$env/dynamic/private';
import { Octokit } from 'octokit';
import type { RootConfig } from '$lib/config/root-config';
import type { RepoBootstrapIdentity } from '$lib/repository/config-bootstrap';
import type {
	GitHubUserSnapshot,
	RecentGitHubRepositorySnapshot,
	SelectedRepoConfigSummary
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
const GITHUB_SESSION_ABSOLUTE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_RECENT_REPOS = 5;
const LOGIN_COOLDOWN_MAX_AGE = 15;
const OAUTH_REQUEST_MAX_AGE = 60 * 10;
const OAUTH_STATE_MAX_AGE_MS = OAUTH_REQUEST_MAX_AGE * 1000;
export const GITHUB_REST_API_VERSION = '2022-11-28';

interface GitHubOAuthRelayStatePayload {
	v: 1;
	nonce: string;
	returnOrigin: string;
	issuedAt: number;
}

interface GitHubOAuthRelayStateEnvelope {
	payload: GitHubOAuthRelayStatePayload;
	signatureValid: boolean;
}

type GitHubOAuthDebugDetails = Record<string, boolean | number | string | null | undefined>;

interface GitHubSessionPayload {
	token: string;
	user: GitHubUserSnapshot;
}

interface GitHubRepoSessionSnapshot {
	v: 1;
	selectedRepoConfigSummary?: SelectedRepoConfigSummary | null;
	// Legacy cookie key from before the session summary was renamed.
	rootConfig?: SelectedRepoConfigSummary | null;
}

interface CookieTarget {
	cookies: Pick<Cookies, 'delete'> & Partial<Pick<Cookies, 'get'>>;
}

interface StoredGitHubSession extends GitHubSessionPayload {
	createdAt: number;
}

interface EncodedGitHubSessionEnvelope {
	v: 1;
	iv: string;
	tag: string;
	payload: string;
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

export function getGitHubOAuthCallbackUrl(requestUrl: URL): string {
	const configuredCallbackUrl = env.GITHUB_OAUTH_CALLBACK_URL?.trim();

	if (!configuredCallbackUrl) {
		const netlifySiteUrl = getNetlifyMainSiteUrlForDeployHost(requestUrl);
		if (netlifySiteUrl) {
			return new URL('/auth/callback', netlifySiteUrl).toString();
		}

		return new URL('/auth/callback', requestUrl).toString();
	}

	try {
		const callbackUrl = new URL(configuredCallbackUrl);

		if (callbackUrl.protocol !== 'http:' && callbackUrl.protocol !== 'https:') {
			throw new Error('Unsupported callback protocol');
		}

		return callbackUrl.toString();
	} catch {
		throw httpError(
			503,
			'GitHub OAuth callback URL is not configured correctly. Set GITHUB_OAUTH_CALLBACK_URL to a full http or https URL.'
		);
	}
}

function getNetlifyMainSiteUrlForDeployHost(requestUrl: URL): URL | null {
	const siteName = env.SITE_NAME?.trim();
	const siteUrl = env.URL?.trim();

	if (!siteName || !siteUrl) {
		return null;
	}

	const expectedDeployHostSuffix = `--${siteName}.netlify.app`;
	if (!requestUrl.hostname.endsWith(expectedDeployHostSuffix)) {
		return null;
	}

	try {
		const parsedSiteUrl = new URL(siteUrl);

		if (parsedSiteUrl.protocol !== 'http:' && parsedSiteUrl.protocol !== 'https:') {
			return null;
		}

		return parsedSiteUrl;
	} catch {
		return null;
	}
}

export function logGitHubOAuthDebug(event: string, details: GitHubOAuthDebugDetails = {}): void {
	console.info(`[DEBUG-github-oauth] ${event}`, JSON.stringify(details));
}

export function getGitHubOAuthStateFingerprint(state: string | null | undefined): string | null {
	if (!state) {
		return null;
	}

	return createHash('sha256').update(state).digest('hex').slice(0, 12);
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

function encodeRepoSessionSnapshot(snapshot: GitHubRepoSessionSnapshot): string {
	return Buffer.from(JSON.stringify(snapshot)).toString('base64url');
}

function decodeRepoSessionSnapshot(value: string): GitHubRepoSessionSnapshot | null {
	try {
		const parsed = JSON.parse(
			Buffer.from(value, 'base64url').toString()
		) as GitHubRepoSessionSnapshot;
		if (
			parsed?.v !== 1 ||
			(!('selectedRepoConfigSummary' in parsed) && !('rootConfig' in parsed))
		) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function getGitHubSessionSecret(): string {
	const configuredSecret = env.GITHUB_SESSION_SECRET?.trim();
	if (configuredSecret) {
		return configuredSecret;
	}

	const fallbackSecret = env.GITHUB_CLIENT_SECRET?.trim();
	if (fallbackSecret) {
		return fallbackSecret;
	}

	throw httpError(
		503,
		'GitHub session storage is not configured for this deployment. Set GITHUB_SESSION_SECRET or GITHUB_CLIENT_SECRET.'
	);
}

function deriveGitHubSessionKey(): Buffer {
	return createHash('sha256').update(getGitHubSessionSecret()).digest();
}

function encodeGitHubSessionEnvelope(envelope: EncodedGitHubSessionEnvelope): string {
	return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

function decodeGitHubSessionEnvelope(value: string): EncodedGitHubSessionEnvelope | null {
	try {
		const parsed = JSON.parse(
			Buffer.from(value, 'base64url').toString()
		) as EncodedGitHubSessionEnvelope;
		if (parsed?.v !== 1 || !parsed.iv || !parsed.tag || !parsed.payload) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function sealGitHubSession(session: StoredGitHubSession): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveGitHubSessionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(session), 'utf8'),
		cipher.final()
	]);
	const tag = cipher.getAuthTag();

	return encodeGitHubSessionEnvelope({
		v: 1,
		iv: iv.toString('base64url'),
		tag: tag.toString('base64url'),
		payload: ciphertext.toString('base64url')
	});
}

function unsealGitHubSession(value: string | undefined): StoredGitHubSession | null {
	if (!value) {
		return null;
	}

	const envelope = decodeGitHubSessionEnvelope(value);
	if (!envelope) {
		return null;
	}

	try {
		const decipher = createDecipheriv(
			'aes-256-gcm',
			deriveGitHubSessionKey(),
			Buffer.from(envelope.iv, 'base64url')
		);
		decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(envelope.payload, 'base64url')),
			decipher.final()
		]);
		const parsed = JSON.parse(plaintext.toString()) as StoredGitHubSession;

		if (
			!parsed ||
			typeof parsed !== 'object' ||
			typeof parsed.token !== 'string' ||
			typeof parsed.createdAt !== 'number' ||
			!parsed.user ||
			typeof parsed.user !== 'object'
		) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function readStoredGitHubSession(sessionValue: string | undefined): {
	session: StoredGitHubSession | null;
	expired: boolean;
} {
	if (!sessionValue) {
		return { session: null, expired: false };
	}

	const session = unsealGitHubSession(sessionValue);
	if (!session) {
		return { session: null, expired: false };
	}

	const now = Date.now();
	const isAbsoluteExpired = now - session.createdAt >= GITHUB_SESSION_ABSOLUTE_TIMEOUT_MS;

	if (isAbsoluteExpired) {
		return { session: null, expired: true };
	}

	return { session, expired: false };
}

export function persistGitHubSession(
	cookies: Pick<Cookies, 'set' | 'delete'>,
	session: GitHubSessionPayload
): void {
	const options = getGitHubCookieOptions();
	const now = Date.now();
	const sessionCookie = sealGitHubSession({
		...session,
		createdAt: now
	});
	cookies.set(GITHUB_SESSION_COOKIE, sessionCookie, options);
	cookies.delete(GITHUB_TOKEN_COOKIE, { path: '/' });
}

export function readGitHubSession(cookies: Pick<Cookies, 'get' | 'delete'>): {
	token?: string;
	user?: GitHubUserSnapshot;
} {
	const { session, expired } = readStoredGitHubSession(cookies.get(GITHUB_SESSION_COOKIE));

	if (expired) {
		clearGitHubSession(cookies);
	}

	return {
		...(session ? { token: session.token, user: session.user } : {})
	};
}

export function persistSelectedGitHubRepository(
	cookies: Pick<Cookies, 'get' | 'set' | 'delete'>,
	repository: GitHubRepositoryIdentity,
	rootConfig: RootConfig | null,
	repositoryIdentity?: RepoBootstrapIdentity | null
): void {
	const options = getGitHubCookieOptions();
	const selectedRepoConfigSummary: SelectedRepoConfigSummary | null = rootConfig
		? {
				...(rootConfig.siteName ? { siteName: rootConfig.siteName } : {}),
				...(rootConfig.componentsDir ? { componentsDir: rootConfig.componentsDir } : {}),
				...(rootConfig.netlify ? { netlify: rootConfig.netlify } : {}),
				...(repositoryIdentity ? { repositoryIdentity } : {})
			}
		: repositoryIdentity
			? { repositoryIdentity }
			: null;

	cookies.set(SELECTED_REPO_COOKIE, JSON.stringify(repository), options);
	cookies.set(
		GITHUB_REPO_SESSION_COOKIE,
		encodeRepoSessionSnapshot({
			v: 1,
			selectedRepoConfigSummary
		}),
		options
	);
	persistRecentGitHubRepository(cookies, repository);
}

export function readSelectedGitHubRepositorySession(cookies: Pick<Cookies, 'get'>): {
	selectedRepoConfigSummary: SelectedRepoConfigSummary | null;
} {
	const rawSession = cookies.get(GITHUB_REPO_SESSION_COOKIE);
	const snapshot = rawSession ? decodeRepoSessionSnapshot(rawSession) : null;

	return {
		selectedRepoConfigSummary: snapshot?.selectedRepoConfigSummary ?? snapshot?.rootConfig ?? null
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

export function clearGitHubSession(
	cookies: Pick<Cookies, 'delete'> & Partial<Pick<Cookies, 'get'>>
): void {
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

function encodeGitHubOAuthRelayStatePayload(payload: GitHubOAuthRelayStatePayload): string {
	return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function signGitHubOAuthRelayStatePayload(encodedPayload: string): string {
	return createHmac('sha256', getGitHubSessionSecret()).update(encodedPayload).digest('base64url');
}

function verifyGitHubOAuthRelayStateSignature(encodedPayload: string, signature: string): boolean {
	const expectedSignature = signGitHubOAuthRelayStatePayload(encodedPayload);
	const signatureBuffer = Buffer.from(signature);
	const expectedSignatureBuffer = Buffer.from(expectedSignature);

	return (
		signatureBuffer.length === expectedSignatureBuffer.length &&
		timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
	);
}

export function createGitHubOAuthState(options: { returnOrigin?: string } = {}): string {
	const nonce = randomBytes(32).toString('hex');

	if (!options.returnOrigin) {
		return nonce;
	}

	const payload = encodeGitHubOAuthRelayStatePayload({
		v: 1,
		nonce,
		returnOrigin: new URL(options.returnOrigin).origin,
		issuedAt: Date.now()
	});
	const signature = signGitHubOAuthRelayStatePayload(payload);

	return `relay.${payload}.${signature}`;
}

export function readGitHubOAuthRelayState(
	state: string | null | undefined
): GitHubOAuthRelayStatePayload | null {
	const envelope = readGitHubOAuthRelayStateEnvelope(state);

	if (!envelope?.signatureValid) {
		return null;
	}

	return envelope.payload;
}

function readGitHubOAuthRelayStateEnvelope(
	state: string | null | undefined
): GitHubOAuthRelayStateEnvelope | null {
	if (!state?.startsWith('relay.')) {
		return null;
	}

	const [, encodedPayload, signature] = state.split('.');

	if (!encodedPayload || !signature) {
		return null;
	}

	try {
		const signatureValid = verifyGitHubOAuthRelayStateSignature(encodedPayload, signature);
		const payload = JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString('utf8')
		) as GitHubOAuthRelayStatePayload;

		if (
			payload?.v !== 1 ||
			typeof payload.nonce !== 'string' ||
			typeof payload.returnOrigin !== 'string' ||
			typeof payload.issuedAt !== 'number' ||
			Date.now() - payload.issuedAt > OAUTH_STATE_MAX_AGE_MS
		) {
			return null;
		}

		return {
			payload: {
				...payload,
				returnOrigin: new URL(payload.returnOrigin).origin
			},
			signatureValid
		};
	} catch {
		return null;
	}
}

export function getGitHubOAuthCallbackRelayUrl(input: {
	callbackUrl: string;
	currentUrl: URL;
	state: string | null | undefined;
}): URL | null {
	const callbackUrl = new URL(input.callbackUrl);
	const relayStateEnvelope = readGitHubOAuthRelayStateEnvelope(input.state);

	if (!relayStateEnvelope || input.currentUrl.origin !== callbackUrl.origin) {
		return null;
	}

	const relayState = relayStateEnvelope.payload;

	if (
		!relayStateEnvelope.signatureValid &&
		!isNetlifyDeployOriginForSite(relayState.returnOrigin)
	) {
		return null;
	}

	if (relayState.returnOrigin === input.currentUrl.origin) {
		return null;
	}

	const relayUrl = new URL('/auth/callback', relayState.returnOrigin);
	relayUrl.search = input.currentUrl.search;

	return relayUrl;
}

function isNetlifyDeployOriginForSite(origin: string): boolean {
	const siteName = env.SITE_NAME?.trim();

	if (!siteName) {
		return false;
	}

	try {
		const url = new URL(origin);
		return url.protocol === 'https:' && url.hostname.endsWith(`--${siteName}.netlify.app`);
	} catch {
		return false;
	}
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

export function createGitHubServerClient(
	token: string,
	cookies: Pick<Cookies, 'delete'> & Partial<Pick<Cookies, 'get'>>
): Octokit {
	const octokit = new Octokit({
		auth: token,
		request: {
			headers: {
				'X-GitHub-Api-Version': GITHUB_REST_API_VERSION
			}
		}
	});

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
