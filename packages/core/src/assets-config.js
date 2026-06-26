export const LEGACY_ASSETS_DIR_WARNING =
	'assetsDir is no longer used. Configure assets.path and assets.publicPath in tentman.json instead.';

const EXTERNAL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i;

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

function isPlainObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSlashes(value) {
	return value.replace(/\\/g, '/');
}

function trimTrailingSlash(value) {
	return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value) {
	return value.replace(/^\/+/, '');
}

function hasQueryOrHash(value) {
	return value.includes('?') || value.includes('#');
}

function normalizePosixPath(value) {
	const parts = [];

	for (const part of value.split('/')) {
		if (!part || part === '.') {
			continue;
		}

		if (part === '..') {
			if (parts.length === 0 || parts.at(-1) === '..') {
				parts.push(part);
			} else {
				parts.pop();
			}
			continue;
		}

		parts.push(part);
	}

	return parts.length > 0 ? parts.join('/') : '.';
}

export function isIgnoredAssetValue(value) {
	if (typeof value !== 'string') {
		return true;
	}

	const trimmed = value.trim();
	return (
		trimmed.length === 0 ||
		/^https?:\/\//i.test(trimmed) ||
		trimmed.startsWith('//') ||
		/^data:/i.test(trimmed) ||
		/^blob:/i.test(trimmed) ||
		/^draft-asset:/i.test(trimmed)
	);
}

function normalizeAssetStoragePath(value) {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return null;
	}

	const normalized = normalizeSlashes(value.trim());

	if (
		normalized.startsWith('/') ||
		normalized.startsWith('~') ||
		EXTERNAL_SCHEME_PATTERN.test(normalized) ||
		WINDOWS_DRIVE_PATTERN.test(normalized)
	) {
		return null;
	}

	const resolved = normalizePosixPath(normalized.replace(/^\.\/+/, ''));

	if (resolved === '.' || resolved === '..' || resolved.startsWith('../')) {
		return null;
	}

	return `${trimTrailingSlash(resolved)}/`;
}

function normalizeAssetPublicPath(value) {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return null;
	}

	const normalized = normalizeSlashes(value.trim());

	if (
		!normalized.startsWith('/') ||
		normalized.startsWith('//') ||
		EXTERNAL_SCHEME_PATTERN.test(normalized) ||
		hasQueryOrHash(normalized)
	) {
		return null;
	}

	const withoutTrailingSlash = normalized === '/' ? '/' : trimTrailingSlash(normalized);
	const parts = withoutTrailingSlash.split('/').filter(Boolean);

	if (parts.includes('..') || parts.includes('.')) {
		return null;
	}

	return withoutTrailingSlash;
}

export function parseRootAssetsConfig(input, context = {}) {
	const pathValue = normalizeAssetStoragePath(input?.path);
	const publicPathValue = normalizeAssetPublicPath(input?.publicPath);

	if (!isPlainObject(input) || !pathValue || !publicPathValue) {
		const label = context.path ? `${context.path}.assets` : 'assets';
		throw new Error(`${label} must include valid path and publicPath`);
	}

	return {
		path: pathValue,
		publicPath: publicPathValue
	};
}

function tryParseRootAssetsConfig(input) {
	try {
		return parseRootAssetsConfig(input);
	} catch {
		return undefined;
	}
}

function collectLegacyAssetsDirDiagnostics(rawRootConfig, diagnostics, owner = { path: 'tentman.json' }) {
	if (!isPlainObject(rawRootConfig)) {
		return;
	}

	if (typeof rawRootConfig.assetsDir === 'string') {
		diagnostics.push(
			createDiagnostic('warning', 'assets.legacy-assets-dir', LEGACY_ASSETS_DIR_WARNING, owner)
		);
	}

	const blocks = Array.isArray(rawRootConfig.blocks) ? rawRootConfig.blocks : [];
	for (const block of blocks) {
		if (!isPlainObject(block)) {
			continue;
		}

		collectLegacyAssetsDirDiagnostics(block, diagnostics, {
			...owner,
			blockId: typeof block.id === 'string' ? block.id : undefined,
			blockType: typeof block.type === 'string' ? block.type : undefined
		});
	}
}

export function getRootAssetsConfigDiagnostics(rawRootConfig) {
	const diagnostics = [];

	if (!isPlainObject(rawRootConfig)) {
		return diagnostics;
	}

	if ('assets' in rawRootConfig && !tryParseRootAssetsConfig(rawRootConfig.assets)) {
		diagnostics.push(
			createDiagnostic(
				'warning',
				'assets.invalid-root-config',
				'assets must include a repo-relative path and root-relative publicPath.',
				{ path: 'tentman.json' }
			)
		);
	}

	collectLegacyAssetsDirDiagnostics(rawRootConfig, diagnostics);

	return diagnostics;
}

export function buildManagedAssetPublicPath(filename, assets) {
	const cleanFilename = trimLeadingSlash(normalizeSlashes(filename ?? '').trim());

	if (!cleanFilename || cleanFilename.includes('..') || hasQueryOrHash(cleanFilename)) {
		return null;
	}

	return assets.publicPath === '/'
		? `/${cleanFilename}`
		: `${assets.publicPath}/${cleanFilename}`;
}

export function resolveManagedAssetValue(value, assets) {
	if (!assets || isIgnoredAssetValue(value)) {
		return { ignored: true };
	}

	const trimmed = normalizeSlashes(value.trim());

	if (hasQueryOrHash(trimmed)) {
		return { ignored: false, valid: false, reason: 'query-or-hash' };
	}

	if (trimmed.startsWith('/')) {
		const publicPrefix = assets.publicPath;
		const matchesPrefix =
			publicPrefix === '/'
				? true
				: trimmed === publicPrefix || trimmed.startsWith(`${publicPrefix}/`);

		if (!matchesPrefix) {
			return { ignored: false, valid: false, reason: 'public-path-mismatch' };
		}

		const relativeValue =
			publicPrefix === '/' ? trimLeadingSlash(trimmed) : trimLeadingSlash(trimmed.slice(publicPrefix.length));
		const normalized = normalizePosixPath(relativeValue);

		if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
			return { ignored: false, valid: false, reason: 'traversal' };
		}

		return {
			ignored: false,
			valid: true,
			repoPath: `${assets.path}${normalized}`,
			relativePath: normalized
		};
	}

	const normalized = normalizePosixPath(trimmed.replace(/^\.\/+/, ''));

	if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
		return { ignored: false, valid: false, reason: 'traversal' };
	}

	return {
		ignored: false,
		valid: true,
		repoPath: `${assets.path}${normalized}`,
		relativePath: normalized
	};
}

export function buildManagedAssetRepoPath(value, assets) {
	const resolved = resolveManagedAssetValue(value, assets);
	return resolved.valid ? resolved.repoPath : null;
}
