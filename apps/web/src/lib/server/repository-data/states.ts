import { resolveContentDocumentState } from '$lib/features/content-management/state';
import type { ResolvedContentState } from '$lib/features/content-management/state';
import type { RepositoryBackend } from '$lib/repository/types';
import { logTiming } from '$lib/utils/performance-logging';
import { canUseGitHubSource } from './source';
import { getRepositorySnapshot } from './snapshot';
import { getSingletonDocument, isSingletonFileConfig } from './documents';
import type { RepositorySnapshot } from './types';

interface SingletonConfigStatesInput {
	backend: RepositoryBackend;
	ref?: string | null;
}

const singletonStateCache = new Map<string, ResolvedContentState | null>();

function getSingletonStateCacheKey(
	snapshot: RepositorySnapshot,
	configSlug: string,
	configPath: string
): string {
	return [
		'singleton-state',
		snapshot.identity.repoKey,
		snapshot.identity.ref,
		snapshot.identity.headSha,
		snapshot.identity.treeSha,
		configSlug,
		configPath
	].join(':');
}

async function getSingletonConfigState(
	input: SingletonConfigStatesInput,
	snapshot: RepositorySnapshot,
	discoveredConfig: RepositorySnapshot['configIndex']['configs'][number]
): Promise<ResolvedContentState | null> {
	if (!isSingletonFileConfig(discoveredConfig.config)) {
		return null;
	}

	const cacheKey = getSingletonStateCacheKey(
		snapshot,
		discoveredConfig.slug,
		discoveredConfig.path
	);
	if (singletonStateCache.has(cacheKey)) {
		return singletonStateCache.get(cacheKey) ?? null;
	}

	const content = await getSingletonDocument({
		backend: input.backend,
		slug: discoveredConfig.slug,
		ref: input.ref
	});
	if (!content) {
		return null;
	}

	const state = resolveContentDocumentState(discoveredConfig.config, content, snapshot.rootConfig);
	singletonStateCache.set(cacheKey, state);
	return state;
}

export async function getSingletonConfigStates(
	input: SingletonConfigStatesInput
): Promise<Record<string, ResolvedContentState> | null> {
	if (!canUseGitHubSource(input.backend)) {
		return null;
	}

	const start = performance.now();
	const snapshot = await getRepositorySnapshot({
		backend: input.backend,
		ref: input.ref
	});
	const stateConfigs = snapshot.configIndex.configs.filter(
		(config) => config.config.state && isSingletonFileConfig(config.config)
	);
	const stateEntries = await Promise.all(
		stateConfigs.map(async (config) => {
			const state = await getSingletonConfigState(input, snapshot, config);
			return [config.slug, state] as const;
		})
	);
	const statesBySlug = Object.fromEntries(
		stateEntries.flatMap(([slug, state]) => (state ? ([[slug, state]] as const) : []))
	);

	logTiming('repository-data.singleton-config-states.load', {
		repoKey: snapshot.identity.repoKey,
		ref: snapshot.identity.ref,
		treeSha: snapshot.identity.treeSha,
		stateConfigCount: stateConfigs.length,
		resolvedStateCount: Object.keys(statesBySlug).length,
		durationMs: performance.now() - start
	});

	return statesBySlug;
}

export function clearSingletonConfigStateCache(): void {
	singletonStateCache.clear();
}

export function clearSingletonConfigStateCacheForScope(input: {
	repoKey: string;
	ref?: string | null;
	configPaths?: string[];
}): void {
	for (const key of singletonStateCache.keys()) {
		if (!key.includes(`:${input.repoKey}:`)) {
			continue;
		}

		if (input.ref && !key.includes(`:${input.ref}:`)) {
			continue;
		}

		if (
			input.configPaths &&
			input.configPaths.length > 0 &&
			!input.configPaths.some((path) => key.endsWith(`:${path}`))
		) {
			continue;
		}

		singletonStateCache.delete(key);
	}
}
