/**
 * Server-side content cache (module-level singleton)
 *
 * Caches fetched content in Node.js memory to avoid repeated GitHub API calls.
 * Content is cached per repository per config and has a TTL for staleness detection.
 */

import type { Config, ConfigType, DiscoveredConfig } from '$lib/types/config';
import { fetchContent } from '$lib/content/fetcher';
import type { RepositoryBackend } from '$lib/repository/types';

interface ContentCacheEntry {
	content: any;
	timestamp: number;
	cacheKey: string;
}

// Cache TTL: 1 minute (matches config cache)
const CACHE_TTL = 60 * 1000;

// Module-level cache (persists across requests in the same Node process)
const cache = new Map<string, ContentCacheEntry>();

/**
 * Get a unique key for content
 * Includes branch to support separate caching of main and draft content
 */
function getContentKey(cacheKey: string, configSlug: string, branch?: string): string {
	return `${cacheKey}/${configSlug}/${branch || 'main'}`;
}

/**
 * Check if a cache entry is still valid
 */
function isValid(entry: ContentCacheEntry | undefined): boolean {
	if (!entry) return false;
	const age = Date.now() - entry.timestamp;
	return age < CACHE_TTL;
}

/**
 * Get cached content for a config, or fetch if not cached/stale
 */
export async function getCachedContent(
	backend: RepositoryBackend,
	config: Config,
	configType: ConfigType,
	configPath: string,
	configSlug: string,
	branch?: string
): Promise<any> {
	const cacheKey = getContentKey(backend.cacheKey, configSlug, branch);
	const cachedEntry = cache.get(cacheKey);

	// If cache is valid, return it
	if (isValid(cachedEntry)) {
		console.log(
			`📦 [CONTENT CACHE] Cache hit for ${cacheKey} (age: ${((Date.now() - cachedEntry!.timestamp) / 1000).toFixed(1)}s)`
		);
		return cachedEntry!.content;
	}

	// Cache miss or stale - fetch from GitHub
	console.log(`🔄 [CONTENT CACHE] Cache miss for ${cacheKey}, fetching from backend...`);
	const fetchStart = performance.now();

	try {
		const content = await fetchContent(backend, config, configType, configPath, branch);
		const fetchTime = performance.now() - fetchStart;
		console.log(`✅ [CONTENT CACHE] Fetched content in ${fetchTime.toFixed(0)}ms`);

		// Update the cache
		cache.set(cacheKey, {
			content,
			timestamp: Date.now(),
			cacheKey
		});

		return content;
	} catch (error) {
		console.error(`❌ [CONTENT CACHE] Failed to fetch content for ${cacheKey}:`, error);
		throw error;
	}
}

/**
 * Prefetch all content for all configs in a repository
 * This loads everything upfront for instant navigation
 */
export async function prefetchAllContent(
	backend: RepositoryBackend,
	configs: DiscoveredConfig[]
): Promise<void> {
	const startTime = performance.now();
	console.log(`🚀 [CONTENT PREFETCH] Starting prefetch for ${configs.length} configs...`);

	// Fetch all content in parallel
	const fetchPromises = configs.map(async (discoveredConfig) => {
		const { config, type, path, slug } = discoveredConfig;

		try {
			await getCachedContent(backend, config, type, path, slug);
		} catch (error) {
			// Log but don't fail the whole prefetch if one config fails
			console.error(`⚠️ [CONTENT PREFETCH] Failed to prefetch ${slug}:`, error);
		}
	});

	await Promise.all(fetchPromises);

	const totalTime = performance.now() - startTime;
	console.log(`✅ [CONTENT PREFETCH] Prefetched all content in ${totalTime.toFixed(0)}ms`);
}

/**
 * Invalidate cache for a specific config
 * If branch is specified, only invalidates that branch's cache
 * If no branch specified, invalidates both main and any draft branches
 */
export function invalidateContent(
	cacheKey: string,
	configSlug?: string,
	branch?: string
): void {
	if (branch) {
		if (!configSlug) {
			throw new Error('configSlug is required when invalidating a specific branch cache entry');
		}

		// Invalidate specific branch
		const specificKey = getContentKey(cacheKey, configSlug, branch);
		console.log(`🗑️ [CONTENT CACHE] Invalidating cache for ${specificKey}`);
		cache.delete(specificKey);
	} else {
		// Invalidate all branches for a config, or the whole repo when no slug is provided.
		const prefix = configSlug ? `${cacheKey}/${configSlug}/` : `${cacheKey}/`;
		const keysToDelete: string[] = [];

		for (const [key] of cache.entries()) {
			if (key.startsWith(prefix)) {
				keysToDelete.push(key);
			}
		}

		console.log(`🗑️ [CONTENT CACHE] Invalidating ${keysToDelete.length} cache entries for ${prefix}*`);
		keysToDelete.forEach(key => cache.delete(key));
	}
}

/**
 * Clear all cached content
 */
export function clearContentCache(): void {
	console.log('🗑️ [CONTENT CACHE] Clearing all cached content');
	cache.clear();
}

/**
 * Get cache stats for debugging
 */
export function getContentCacheStats(): { cacheKey: string; age: number }[] {
	return Array.from(cache.values()).map((entry) => ({
		cacheKey: entry.cacheKey,
		age: Date.now() - entry.timestamp
	}));
}
