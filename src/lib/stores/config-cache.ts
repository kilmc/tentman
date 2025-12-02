/**
 * Server-side config cache (module-level singleton)
 *
 * Caches discovered configs in Node.js memory to avoid repeated GitHub API calls.
 * Configs are cached per repository and have a TTL for staleness detection.
 *
 * Note: This is a server-side cache that persists across requests in the same Node process.
 * For client-side caching, SvelteKit's built-in load caching is used instead.
 */

import type { DiscoveredConfig } from '$lib/types/config';
import type { Octokit } from 'octokit';
import { discoverConfigs } from '$lib/config/discovery';

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
function getRepoKey(owner: string, repo: string): string {
	return `${owner}/${repo}`;
}

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
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<DiscoveredConfig[]> {
	const repoKey = getRepoKey(owner, repo);
	const cachedEntry = cache.get(repoKey);

	// If cache is valid, return it
	if (isValid(cachedEntry)) {
		console.log(
			`📦 [CONFIG CACHE] Cache hit for ${repoKey} (age: ${((Date.now() - cachedEntry!.timestamp) / 1000).toFixed(1)}s)`
		);
		return cachedEntry!.configs;
	}

	// Cache miss or stale - fetch from GitHub
	console.log(`🔄 [CONFIG CACHE] Cache miss for ${repoKey}, fetching from GitHub...`);
	const fetchStart = performance.now();

	try {
		const configs = await discoverConfigs(octokit, owner, repo);
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
export function invalidateCache(owner: string, repo: string): void {
	const repoKey = getRepoKey(owner, repo);
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
