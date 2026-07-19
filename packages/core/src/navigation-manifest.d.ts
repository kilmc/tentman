export interface NavigationReference {
	id: string;
	label?: string;
	slug?: string;
	href?: string;
}

export type NavigationReferenceInput = string | NavigationReference;

export interface NavigationManifestGroup {
	id: string;
	label?: string;
	value?: string;
	href?: string;
	items: NavigationReference[];
}

export interface NavigationManifestCollection {
	id?: string;
	label?: string;
	slug?: string;
	href?: string;
	configId?: string;
	items: NavigationReference[];
	groups?: NavigationManifestGroup[];
}

export interface NavigationManifest {
	version: 1;
	content?: {
		items: NavigationReference[];
	};
	collections?: Record<string, NavigationManifestCollection>;
}

export interface NavigationManifestCollectionEntry {
	reference: string;
	collection: NavigationManifestCollection;
	references: string[];
}

export interface NavigationManifestGroupInput {
	id: string;
	label?: string;
	value?: string;
	href?: string;
	items?: NavigationReferenceInput[];
}

export interface NavigationManifestCollectionInput {
	id?: string;
	label?: string;
	slug?: string;
	href?: string;
	configId?: string;
	items?: NavigationReferenceInput[];
	groups?: NavigationManifestGroupInput[];
}

export interface NavigationManifestInput {
	version: 1;
	content?: {
		items?: NavigationReferenceInput[];
	};
	collections?: Record<string, NavigationManifestCollectionInput>;
}

export const NAVIGATION_MANIFEST_PATH: string;
export function normalizeNavigationReference(
	reference: NavigationReferenceInput,
	context?: string
): NavigationReference;
export function normalizeNavigationManifest(manifest: NavigationManifestInput): NavigationManifest;
export function parseNavigationManifest(source: string): NavigationManifest;
export function serializeNavigationManifest(manifest: NavigationManifestInput): string;
export function getNavigationReferenceId(
	reference: NavigationReferenceInput | Partial<NavigationReference> | null | undefined
): string | undefined;
export function getNavigationReferenceIds(
	references: Array<NavigationReferenceInput | Partial<NavigationReference>> | null | undefined
): string[];
export function getNavigationManifestContentItems(
	manifest: NavigationManifest | null | undefined
): NavigationReference[];
export function getNavigationManifestCollectionEntries(
	manifest: NavigationManifest | null | undefined
): NavigationManifestCollectionEntry[];
export function getNavigationManifestCollectionReferenceIds(
	reference: string,
	collection: NavigationManifestCollection | null | undefined
): string[];
export function getNavigationManifestCollectionEntry(
	manifest: NavigationManifest | null | undefined,
	reference: NavigationReferenceInput | Partial<NavigationReference> | null | undefined
): NavigationManifestCollectionEntry | null;
export function getNavigationManifestCollection(
	manifest: NavigationManifest | null | undefined,
	reference: NavigationReferenceInput | Partial<NavigationReference> | null | undefined
): NavigationManifestCollection | null;
export function getNavigationManifestCollectionItems(
	collection: NavigationManifestCollection | null | undefined
): NavigationReference[];
export function getNavigationManifestGroups(
	collection: NavigationManifestCollection | null | undefined
): NavigationManifestGroup[];
export function getNavigationManifestGroupReferenceIds(
	group: NavigationManifestGroup | null | undefined
): string[];
export function getNavigationManifestGroup(
	collection: NavigationManifestCollection | null | undefined,
	reference: NavigationReferenceInput | Partial<NavigationReference> | null | undefined
): NavigationManifestGroup | null;
export function getNavigationManifestGroupItems(
	group: NavigationManifestGroup | null | undefined
): NavigationReference[];
