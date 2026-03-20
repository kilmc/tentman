/**
 * Server-side config cache (module-level singleton)
 *
 * Caches discovered configs in Node.js memory to avoid repeated GitHub API calls.
 * Configs are cached per repository and have a TTL for staleness detection.
 *
 * Note: This is a server-side cache that persists across requests in the same Node process.
 * For client-side caching, SvelteKit's built-in load caching is used instead.
 */

import type { DiscoveredConfig } from '$lib/config/discovery';
import type { RepositoryBackend } from '$lib/repository/types';

interface CacheEntry {
	configs: DiscoveredConfig[];
	timestamp: number;
	repoKey: string;
}

// Cache TTL: 1 minute (short TTL since this is server-side)
const CACHE_TTL = 60 * 1000;

// Module-level cache (persists across requests in the same Node process)
const cache = new Map<string, CacheEntry>();

/**
 * Get a unique key for a repository
 */
/**
 * Check if a cache entry is still valid
 */
function isValid(entry: CacheEntry | undefined): boolean {
	if (!entry) return false;
	const age = Date.now() - entry.timestamp;
	return age < CACHE_TTL;
}

/**
 * Get cached configs for a repository, or fetch if not cached/stale
 */
export async function getCachedConfigs(
	backend: RepositoryBackend
): Promise<DiscoveredConfig[]> {
	const repoKey = backend.cacheKey;
	const cachedEntry = cache.get(repoKey);

	// If cache is valid, return it
	if (isValid(cachedEntry)) {
		console.log(
			`📦 [CONFIG CACHE] Cache hit for ${repoKey} (age: ${((Date.now() - cachedEntry!.timestamp) / 1000).toFixed(1)}s)`
		);
		return cachedEntry!.configs;
	}

	// Cache miss or stale - fetch from GitHub
	console.log(`🔄 [CONFIG CACHE] Cache miss for ${repoKey}, fetching from backend...`);
	const fetchStart = performance.now();

	try {
		const configs = await backend.discoverConfigs();
		const fetchTime = performance.now() - fetchStart;
		console.log(`✅ [CONFIG CACHE] Fetched ${configs.length} configs in ${fetchTime.toFixed(0)}ms`);

		// Update the cache
		cache.set(repoKey, {
			configs,
			timestamp: Date.now(),
			repoKey
		});

		return configs;
	} catch (error) {
		console.error(`❌ [CONFIG CACHE] Failed to fetch configs for ${repoKey}:`, error);
		throw error;
	}
}

/**
 * Invalidate cache for a specific repository
 */
export function invalidateCache(repoKey: string): void {
	console.log(`🗑️ [CONFIG CACHE] Invalidating cache for ${repoKey}`);
	cache.delete(repoKey);
}

/**
 * Clear all cached configs
 */
export function clearCache(): void {
	console.log('🗑️ [CONFIG CACHE] Clearing all cached configs');
	cache.clear();
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { repoKey: string; age: number; configCount: number }[] {
	return Array.from(cache.values()).map((entry) => ({
		repoKey: entry.repoKey,
		age: Date.now() - entry.timestamp,
		configCount: entry.configs.length
	}));
}
