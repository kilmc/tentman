type QueryValue = string | null | undefined;

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
