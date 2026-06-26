import type { RootConfig } from '$lib/config/root-config';
import type { GitHubRepositoryIdentity } from '$lib/repository/github';
import type { SelectedBackend } from '$lib/repository/selection';
import { buildRepoAssetProxyUrl, isAbsoluteAssetUrl, resolveAssetValue } from '$lib/utils/assets';

export type RootAssetsConfig = NonNullable<RootConfig['assets']>;

export type AssetRenderContext =
	| {
			mode: 'github';
			assets: RootAssetsConfig | null;
			repository: {
				owner: string;
				name: string;
				defaultBranch: string;
			} | null;
	  }
	| {
			mode: 'local';
			assets: RootAssetsConfig | null;
			previewBaseUrl: string | null;
	  }
	| {
			mode: 'none';
			assets: null;
			previewBaseUrl: null;
	  };

export function getAssetRenderContext(input: {
	selectedBackend: SelectedBackend | null | undefined;
	selectedRepo: GitHubRepositoryIdentity | null | undefined;
	rootConfig: RootConfig | null | undefined;
	localRootConfig: RootConfig | null | undefined;
	localPreviewUrl: string | null | undefined;
}): AssetRenderContext {
	if (input.selectedBackend?.kind === 'github') {
		const repository = input.selectedRepo ?? input.selectedBackend.repo;

		return {
			mode: 'github',
			assets: input.rootConfig?.assets ?? null,
			repository: repository
				? {
						owner: repository.owner,
						name: repository.name,
						defaultBranch: repository.default_branch
					}
				: null
		};
	}

	if (input.selectedBackend?.kind === 'local') {
		return {
			mode: 'local',
			assets: input.localRootConfig?.assets ?? null,
			previewBaseUrl: input.localPreviewUrl ?? input.localRootConfig?.local?.previewUrl ?? null
		};
	}

	return {
		mode: 'none',
		assets: null,
		previewBaseUrl: null
	};
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
		return trimmedValue;
	}

	if (context.mode === 'github') {
		if (!context.assets) {
			return trimmedValue.startsWith('/') ? trimmedValue : null;
		}

		return buildRepoAssetProxyUrl(trimmedValue, {
			assets: context.assets,
			repository: context.repository
		});
	}

	if (context.mode === 'local') {
		return resolveAssetValue(trimmedValue, {
			assets: context.assets ?? undefined,
			previewBaseUrl: context.previewBaseUrl
		});
	}

	return trimmedValue.startsWith('/') ? trimmedValue : null;
}
