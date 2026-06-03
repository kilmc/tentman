import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/config/discovery';
import type { DraftMetadata } from '$lib/utils/draft-comparison';
import type { RootConfig } from '$lib/config/root-config';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type { RepositoryBackend } from '$lib/repository/types';

export type RepositoryMode = RepositoryBackend['kind'];

export interface RepositorySourceIdentity {
	mode: RepositoryMode;
	repoKey: string;
	label: string;
}

export interface RepositoryRefIdentity extends RepositorySourceIdentity {
	ref: string;
	headSha: string;
	treeSha: string;
	resolvedAt: number;
}

export interface RepositoryTreeEntry {
	path: string;
	sha: string;
	type: 'blob' | 'tree' | string;
	size?: number;
}

export interface RepositoryTree {
	identity: RepositoryRefIdentity;
	entries: RepositoryTreeEntry[];
	truncated: boolean;
}

export interface ConfigIndex {
	configs: DiscoveredConfig[];
	bySlug: Map<string, DiscoveredConfig>;
	byConfigPath: Map<string, DiscoveredConfig>;
}

export interface BlockConfigIndex {
	configs: DiscoveredBlockConfig[];
	byId: Map<string, DiscoveredBlockConfig>;
	byConfigPath: Map<string, DiscoveredBlockConfig>;
}

export interface RepositorySnapshot {
	identity: RepositoryRefIdentity;
	rootConfig: RootConfig | null;
	configIndex: ConfigIndex;
	blockConfigIndex: BlockConfigIndex;
	navigationManifest: NavigationManifestState;
	tree?: RepositoryTree;
	loadedAt: number;
}

export interface RepositorySnapshotInput {
	backend: RepositoryBackend;
	ref?: string | null;
}

export interface CollectionIndexIdentity {
	repoKey: string;
	ref: string;
	headSha: string;
	treeSha: string;
	configSlug: string;
	configPath: string;
	contentIdentity: string;
	schemaIdentity: string;
}

export interface CollectionIndexItem {
	itemId: string;
	route: string;
	path: string;
	filename: string;
	blobSha: string;
	index?: number;
	title: string;
	sortDate?: number | null;
	state?: ResolvedContentState | null;
}

export interface CollectionIndex {
	identity: CollectionIndexIdentity;
	configSlug: string;
	mode: 'directory' | 'file';
	items: CollectionIndexItem[];
	byId: Map<string, CollectionIndexItem>;
	byRoute: Map<string, CollectionIndexItem>;
	byPath: Map<string, CollectionIndexItem>;
}

export interface DraftChangedFile {
	filename: string;
	status: string;
	previous_filename?: string;
}

export interface ConfigDraftChangeScope {
	slug: string;
	modified: string[];
	created: string[];
	deleted: string[];
	requiresFullFetch: boolean;
}

export interface DraftChangeIndex {
	owner: string;
	repo: string;
	baseBranch: string;
	draftBranch: string;
	metadata: DraftMetadata;
	files: DraftChangedFile[];
	byConfigSlug: Map<string, ConfigDraftChangeScope>;
}
