import type { DiscoveredBlockConfig, DiscoveredConfig } from '$lib/types/config';
import type { RootConfig } from '$lib/config/root-config';

export interface RepoEntry {
	name: string;
	path: string;
	kind: 'file' | 'directory';
}

export interface RepositoryReadOptions {
	ref?: string;
}

export interface RepositoryWriteOptions extends RepositoryReadOptions {
	message?: string;
}

export interface RepositoryBackend {
	kind: 'github' | 'local';
	cacheKey: string;
	label: string;
	supportsDraftBranches: boolean;
	discoverConfigs(): Promise<DiscoveredConfig[]>;
	discoverBlockConfigs(): Promise<DiscoveredBlockConfig[]>;
	readRootConfig(): Promise<RootConfig | null>;
	readTextFile(path: string, options?: RepositoryReadOptions): Promise<string>;
	writeTextFile(path: string, content: string, options?: RepositoryWriteOptions): Promise<void>;
	deleteFile(path: string, options?: RepositoryWriteOptions): Promise<void>;
	listDirectory(path: string, options?: RepositoryReadOptions): Promise<RepoEntry[]>;
	fileExists(path: string, options?: RepositoryReadOptions): Promise<boolean>;
}
