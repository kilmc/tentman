import type { RepoEntry, RepositoryBackend, RepositoryReadOptions } from '$lib/repository/types';

export type AssetPickerKind = 'image' | 'video' | 'audio' | 'file';

export interface AssetPickerFilter {
	kind: AssetPickerKind;
	extensions: string[];
	mimePrefix?: string;
}

export interface AssetPickerEntry {
	name: string;
	repoPath: string;
	publicPath: string;
	relativePath: string;
	kind: AssetPickerKind;
	extension: string;
}

export interface AssetPickerConfig {
	assetPath?: string | null;
	publicPath?: string | null;
}

const ASSET_PICKER_LOG_PREFIX = '[tentman:asset-picker]';

function logAssetPickerDebug(message: string, payload?: Record<string, unknown>) {
	console.info(`${ASSET_PICKER_LOG_PREFIX} ${message}`, payload ?? {});
}

export const imageAssetFilter: AssetPickerFilter = {
	kind: 'image',
	extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'],
	mimePrefix: 'image/'
};

export function normalizeAssetPickerPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/\/+/g, '/')
		.replace(/\/+$/, '');
}

function trimPublicPath(path: string): string {
	const trimmed = path.trim().replace(/\/+$/, '');
	return trimmed || '/';
}

function getPathSegments(path: string): string[] {
	return normalizeAssetPickerPath(path).split('/').filter(Boolean);
}

export function isSafeAssetPickerRelativePath(path: string): boolean {
	const normalized = normalizeAssetPickerPath(path);
	return (
		normalized.length > 0 &&
		!normalized.startsWith('/') &&
		!getPathSegments(normalized).some((segment) => segment === '..' || segment === '.')
	);
}

export function getAssetPickerExtension(path: string): string {
	const name = getPathSegments(path).at(-1) ?? '';
	const index = name.lastIndexOf('.');
	return index > -1 ? name.slice(index).toLowerCase() : '';
}

export function assetPickerEntryMatchesFilter(path: string, filter: AssetPickerFilter): boolean {
	const extension = getAssetPickerExtension(path);
	return filter.extensions.some((allowed) => allowed.toLowerCase() === extension);
}

export function createAssetPickerPublicPath(
	relativePath: string,
	publicPath: string
): string | null {
	if (!isSafeAssetPickerRelativePath(relativePath)) {
		return null;
	}

	const normalizedPublicPath = trimPublicPath(publicPath);
	const normalizedRelativePath = normalizeAssetPickerPath(relativePath);

	return normalizedPublicPath === '/'
		? `/${normalizedRelativePath}`
		: `${normalizedPublicPath}/${normalizedRelativePath}`;
}

export function createAssetPickerEntry(options: {
	repoPath: string;
	assetPath: string;
	publicPath: string;
	filter: AssetPickerFilter;
}): AssetPickerEntry | null {
	const assetPath = normalizeAssetPickerPath(options.assetPath);
	const repoPath = normalizeAssetPickerPath(options.repoPath);
	const prefix = assetPath ? `${assetPath}/` : '';
	const relativePath =
		assetPath && repoPath.startsWith(prefix)
			? repoPath.slice(prefix.length)
			: assetPath === repoPath
				? ''
				: repoPath;

	if (!isSafeAssetPickerRelativePath(relativePath)) {
		return null;
	}

	if (!assetPickerEntryMatchesFilter(relativePath, options.filter)) {
		return null;
	}

	const publicPath = createAssetPickerPublicPath(relativePath, options.publicPath);
	if (!publicPath) {
		return null;
	}

	const name = getPathSegments(relativePath).at(-1) ?? relativePath;

	return {
		name,
		repoPath,
		publicPath,
		relativePath: normalizeAssetPickerPath(relativePath),
		kind: options.filter.kind,
		extension: getAssetPickerExtension(relativePath)
	};
}

export function hasAssetPickerConfig(config: AssetPickerConfig): config is {
	assetPath: string;
	publicPath: string;
} {
	return Boolean(config.assetPath?.trim() && config.publicPath?.trim());
}

async function listDirectorySafe(
	backend: Pick<RepositoryBackend, 'listDirectory'>,
	path: string,
	options?: RepositoryReadOptions
): Promise<RepoEntry[]> {
	try {
		return await backend.listDirectory(path, options);
	} catch (error) {
		const message = error instanceof Error ? error.message.toLowerCase() : '';
		if (message.includes('not found') || message.includes('no such file')) {
			return [];
		}

		throw error;
	}
}

export async function listAssetPickerEntries(options: {
	backend: Pick<RepositoryBackend, 'listDirectory'>;
	config: AssetPickerConfig;
	filter: AssetPickerFilter;
	readOptions?: RepositoryReadOptions;
}): Promise<AssetPickerEntry[]> {
	if (!hasAssetPickerConfig(options.config)) {
		logAssetPickerDebug('scanner skipped: missing config', {
			assetPath: options.config.assetPath ?? null,
			publicPath: options.config.publicPath ?? null,
			kind: options.filter.kind,
			extensions: options.filter.extensions
		});
		return [];
	}

	const assetPath = normalizeAssetPickerPath(options.config.assetPath);
	const pending = [assetPath];
	const entries: AssetPickerEntry[] = [];
	let directoriesRead = 0;
	let filesSeen = 0;
	let filesRejected = 0;

	logAssetPickerDebug('scanner start', {
		assetPath,
		publicPath: options.config.publicPath,
		kind: options.filter.kind,
		extensions: options.filter.extensions
	});

	while (pending.length > 0) {
		const nextPath = pending.shift();
		if (!nextPath) {
			continue;
		}

		const directoryEntries = await listDirectorySafe(
			options.backend,
			nextPath,
			options.readOptions
		);
		directoriesRead += 1;
		logAssetPickerDebug('scanner directory read', {
			path: nextPath,
			count: directoryEntries.length,
			directoriesQueued: pending.length
		});
		for (const entry of directoryEntries) {
			if (entry.kind === 'directory') {
				pending.push(entry.path);
				continue;
			}

			filesSeen += 1;
			const assetEntry = createAssetPickerEntry({
				repoPath: entry.path,
				assetPath,
				publicPath: options.config.publicPath,
				filter: options.filter
			});

			if (assetEntry) {
				entries.push(assetEntry);
			} else {
				filesRejected += 1;
			}
		}
	}

	const sortedEntries = entries.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath)
	);
	logAssetPickerDebug('scanner complete', {
		assetPath,
		directoriesRead,
		filesSeen,
		filesMatched: sortedEntries.length,
		filesRejected,
		sample: sortedEntries.slice(0, 5).map((entry) => ({
			repoPath: entry.repoPath,
			publicPath: entry.publicPath
		}))
	});

	return sortedEntries;
}
