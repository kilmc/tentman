type QueryValue = string | null | undefined;
const INTERNAL_ORIGIN = 'http://tentman.local';

interface RouteLocationLike {
	pathname: string;
	search: string;
}

export function getRoutePath(currentRoute: RouteLocationLike): string {
	return `${currentRoute.pathname}${currentRoute.search}`;
}

export function readOptionalSearchParam(
	searchParams: URLSearchParams,
	key: string
): string | undefined {
	const value = searchParams.get(key);

	return value ? value : undefined;
}

export function buildPathWithQuery(
	pathname: string,
	query: Record<string, QueryValue> = {}
): string {
	const searchParams = new URLSearchParams();

	for (const [key, value] of Object.entries(query)) {
		if (!value) {
			continue;
		}

		searchParams.set(key, value);
	}

	const search = searchParams.toString();

	return search ? `${pathname}?${search}` : pathname;
}

export function buildLoginRedirect(loginPath: string, currentRoute: RouteLocationLike): string {
	return buildPathWithQuery(loginPath, {
		redirect: getRoutePath(currentRoute)
	});
}

export function buildReposReturnHref(
	reposPath: string,
	returnTo: string | null | undefined
): string {
	return buildPathWithQuery(reposPath, {
		returnTo: sanitizeAuthRedirectTarget(returnTo, '/repos')
	});
}

export function buildReposRedirect(reposPath: string, currentRoute: RouteLocationLike): string {
	return buildReposReturnHref(reposPath, getRoutePath(currentRoute));
}

export function sanitizeAuthRedirectTarget(
	value: string | null | undefined,
	fallback = '/'
): string {
	if (!value) {
		return fallback;
	}

	try {
		const url = new URL(value, INTERNAL_ORIGIN);

		if (url.origin !== INTERNAL_ORIGIN) {
			return fallback;
		}

		const target = `${url.pathname}${url.search}`;

		if (!target.startsWith('/') || target === '/auth' || target.startsWith('/auth/')) {
			return fallback;
		}

		return target;
	} catch {
		return fallback;
	}
}
