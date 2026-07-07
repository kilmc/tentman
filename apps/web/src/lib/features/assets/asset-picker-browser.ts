import { get } from 'svelte/store';
import { localRepo } from '$lib/stores/local-repo';
import {
	listAssetPickerEntries,
	type AssetPickerConfig,
	type AssetPickerEntry,
	type AssetPickerFilter
} from '$lib/features/assets/asset-picker';

export async function loadAssetPickerEntriesForMode(options: {
	mode: 'github' | 'local';
	config: AssetPickerConfig;
	filter: AssetPickerFilter;
}): Promise<AssetPickerEntry[]> {
	console.info('[tentman:asset-picker] loader start', {
		mode: options.mode,
		assetPath: options.config.assetPath ?? null,
		publicPath: options.config.publicPath ?? null,
		kind: options.filter.kind,
		extensions: options.filter.extensions
	});

	if (options.mode === 'local') {
		const backend = get(localRepo).backend;
		if (!backend) {
			console.warn('[tentman:asset-picker] local loader missing backend');
			throw new Error('No local repository backend is available for asset browsing');
		}

		const entries = await listAssetPickerEntries({
			backend,
			config: options.config,
			filter: options.filter
		});
		console.info('[tentman:asset-picker] local loader complete', { count: entries.length });
		return entries;
	}

	const url = `/api/repo/assets?assetPath=${encodeURIComponent(options.config.assetPath ?? '')}&publicPath=${encodeURIComponent(options.config.publicPath ?? '')}&kind=${encodeURIComponent(options.filter.kind)}&extensions=${encodeURIComponent(options.filter.extensions.join(','))}`;
	console.info('[tentman:asset-picker] github loader request', { url });

	const response = await fetch(url);
	console.info('[tentman:asset-picker] github loader response', {
		status: response.status,
		ok: response.ok
	});

	if (!response.ok) {
		throw new Error(`Failed to list assets (${response.status})`);
	}

	const payload = (await response.json()) as { entries: AssetPickerEntry[] };
	console.info('[tentman:asset-picker] github loader complete', {
		count: payload.entries.length,
		sample: payload.entries.slice(0, 5).map((entry) => ({
			repoPath: entry.repoPath,
			publicPath: entry.publicPath
		}))
	});
	return payload.entries;
}
