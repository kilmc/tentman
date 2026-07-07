import { browser, dev } from '$app/environment';
import type { RootConfig } from '$lib/config/root-config';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';
import { buildRepoAssetProxyUrl, isAbsoluteAssetUrl } from '$lib/utils/assets';

export type RootAssetsConfig = NonNullable<RootConfig['assets']>;
export const ASSET_RENDER_TRACE_FLAG = 'tentman:trace-assets';
const GITHUB_PUBLIC_PATH_FALLBACK_ASSETS: RootAssetsConfig = {
	path: 'static',
	publicPath: '/'
};

export type AssetRenderContext =
	| {
			mode: 'github';
			assets: RootAssetsConfig | null;
			repository: {
				owner: string;
				name: string;
				defaultBranch: string;
			} | null;
			source?: string;
	  }
	| {
			mode: 'local';
			assets: RootAssetsConfig | null;
			previewBaseUrl: string | null;
			source?: string;
	  }
	| {
			mode: 'none';
			assets: null;
			previewBaseUrl: null;
			source?: string;
	  };

function isAssetRenderTraceEnabled(): boolean {
	if (!browser || !dev) {
		return false;
	}

	try {
		return window.localStorage.getItem(ASSET_RENDER_TRACE_FLAG) === '1';
	} catch {
		return false;
	}
}

function logAssetRenderTrace(
	event: string,
	detail: Record<string, unknown>,
	level: 'info' | 'warn' = 'info'
): void {
	if (!dev || !isAssetRenderTraceEnabled()) {
		return;
	}

	const payload = {
		event,
		timestamp: new Date().toISOString(),
		...detail
	};

	if (level === 'warn') {
		console.warn('[tentman:assets]', payload);
		return;
	}

	console.info('[tentman:assets]', payload);
}

export function getAssetRenderContext(input: {
	selectedBackend: SelectedBackend | null | undefined;
	selectedRepo: GitHubRepositoryIdentity | null | undefined;
	rootConfig: RootConfig | null | undefined;
	localRootConfig: RootConfig | null | undefined;
	localPreviewUrl: string | null | undefined;
	source?: string;
}): AssetRenderContext {
	if (input.selectedBackend?.kind === 'github') {
		const repository = input.selectedRepo ?? input.selectedBackend.repo;
		const assets = input.rootConfig?.assets ?? null;
		const context = {
			mode: 'github' as const,
			assets,
			repository: repository
				? {
						owner: repository.owner,
						name: repository.name,
						defaultBranch: repository.default_branch
					}
				: null,
			source: input.source
		};

		logAssetRenderTrace(
			'context',
			{
				source: input.source ?? null,
				mode: context.mode,
				selectedRepo: repository?.full_name ?? null,
				hasRootConfig: Boolean(input.rootConfig),
				rootConfigKeys: input.rootConfig ? Object.keys(input.rootConfig).sort() : [],
				hasAssets: Boolean(assets),
				assetPath: assets?.path ?? null,
				publicPath: assets?.publicPath ?? null
			},
			assets ? 'info' : 'warn'
		);

		return context;
	}

	if (input.selectedBackend?.kind === 'local') {
		const context: AssetRenderContext = {
			mode: 'local',
			assets: input.localRootConfig?.assets ?? null,
			previewBaseUrl: input.localPreviewUrl ?? input.localRootConfig?.local?.previewUrl ?? null,
			source: input.source
		};

		logAssetRenderTrace('context', {
			source: input.source ?? null,
			mode: context.mode,
			hasLocalRootConfig: Boolean(input.localRootConfig),
			hasAssets: Boolean(context.assets),
			assetPath: context.assets?.path ?? null,
			publicPath: context.assets?.publicPath ?? null,
			previewBaseUrl: context.previewBaseUrl
		});

		return context;
	}

	const context: AssetRenderContext = {
		mode: 'none',
		assets: null,
		previewBaseUrl: null,
		source: input.source
	};

	logAssetRenderTrace('context', {
		source: input.source ?? null,
		mode: context.mode
	});

	return context;
}

export function resolveAssetUrlForRender(
	value: string | null | undefined,
	context: AssetRenderContext
): string | null {
	if (!value) {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	if (isAbsoluteAssetUrl(trimmedValue)) {
		logAssetRenderTrace('resolve:absolute', {
			source: context.source ?? null,
			mode: context.mode,
			value: trimmedValue,
			resolved: trimmedValue
		});
		return trimmedValue;
	}

	if (context.mode === 'github') {
		if (!context.assets) {
			const resolved = trimmedValue.startsWith('/')
				? buildRepoAssetProxyUrl(trimmedValue, {
						assets: GITHUB_PUBLIC_PATH_FALLBACK_ASSETS,
						repository: context.repository
					})
				: null;
			logAssetRenderTrace(
				'resolve:github-missing-assets',
				{
					source: context.source ?? null,
					mode: context.mode,
					value: trimmedValue,
					resolved,
					repository: context.repository
						? `${context.repository.owner}/${context.repository.name}`
						: null,
					fallbackAssetPath: trimmedValue.startsWith('/')
						? GITHUB_PUBLIC_PATH_FALLBACK_ASSETS.path
						: null,
					fallbackPublicPath: trimmedValue.startsWith('/')
						? GITHUB_PUBLIC_PATH_FALLBACK_ASSETS.publicPath
						: null
				},
				'warn'
			);
			return resolved;
		}

		const resolved = buildRepoAssetProxyUrl(trimmedValue, {
			assets: context.assets,
			repository: context.repository
		});
		logAssetRenderTrace('resolve:github-proxy', {
			source: context.source ?? null,
			mode: context.mode,
			value: trimmedValue,
			resolved,
			assetPath: context.assets.path,
			publicPath: context.assets.publicPath,
			repository: context.repository ? `${context.repository.owner}/${context.repository.name}` : null
		});
		return resolved;
	}

	if (context.mode === 'local') {
		const resolved = null;
		logAssetRenderTrace('resolve:local', {
			source: context.source ?? null,
			mode: context.mode,
			value: trimmedValue,
			resolved,
			assetPath: context.assets?.path ?? null,
			publicPath: context.assets?.publicPath ?? null,
			previewBaseUrl: context.previewBaseUrl
		});
		return resolved;
	}

	const resolved = trimmedValue.startsWith('/') ? trimmedValue : null;
	logAssetRenderTrace('resolve:none', {
		source: context.source ?? null,
		mode: context.mode,
		value: trimmedValue,
		resolved
	});
	return resolved;
}
