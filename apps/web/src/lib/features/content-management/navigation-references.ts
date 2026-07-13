import type { NavigationReference } from '@tentman/core/navigation-manifest';

export function toNavigationReferences(ids: string[]): NavigationReference[] {
	return ids.map((id) => ({ id }));
}
