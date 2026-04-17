<script lang="ts">
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import AssetImage from '$lib/components/AssetImage.svelte';
	import { loadPluginRegistryForMode } from '$lib/plugins/browser';
	import { applyPreviewPluginTransforms } from '$lib/plugins/registry';
	import { localContent } from '$lib/stores/local-content';
	import ContentValueDisplay from './ContentValueDisplay.svelte';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
	import type { BlockUsage } from '$lib/config/types';
	import { formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
	import type { SitePluginRegistry, UnifiedLocalPlugin } from '$lib/plugins/types';

	type PreviewPluginRegistryLoader = () => Promise<SitePluginRegistry>;

	interface Props {
		block: BlockUsage;
		value: ContentValue | undefined;
		blockRegistry: BlockRegistry;
		previewPluginRegistryLoader?: PreviewPluginRegistryLoader;
	}

	let { block, value, blockRegistry, previewPluginRegistryLoader }: Props = $props();
	let previewMarkdown = $state(typeof value === 'string' ? value : '');
	let previewPluginError = $state<string | null>(null);
	let localPreviewPluginRegistryPromise: Promise<SitePluginRegistry> | null = null;
	let localPreviewPluginRegistryKey: string | null = null;

	const structuredBlocks = getStructuredBlocksForUsage(block, blockRegistry);

	function getBlockLabel(target: BlockUsage): string {
		return (
			target.label ??
			target.id
				.replace(/([A-Z])/g, ' $1')
				.replace(/_/g, ' ')
				.replace(/^./, (str) => str.toUpperCase())
				.trim()
		);
	}

	function getActiveRootConfig() {
		return page.data.selectedBackend?.kind === 'local'
			? get(localContent).rootConfig
			: (page.data.rootConfig ?? null);
	}

	function getPluginMode(): 'local' | 'github' {
		return page.data.selectedBackend?.kind === 'local' ? 'local' : 'github';
	}

	function getPluginScopeKey(): string {
		if (page.data.selectedBackend?.kind === 'local') {
			return `local:${page.data.selectedBackend.repo.pathLabel}`;
		}

		if (page.data.selectedRepo) {
			return `github:${page.data.selectedRepo.owner}/${page.data.selectedRepo.name}`;
		}

		return getPluginMode();
	}

	function getPreviewPluginRegistryKey(): string {
		const rootConfig = getActiveRootConfig();

		return JSON.stringify({
			mode: getPluginMode(),
			scopeKey: getPluginScopeKey(),
			pluginsDir: rootConfig?.pluginsDir ?? null,
			plugins: rootConfig?.plugins ?? []
		});
	}

	function getPreviewPluginRegistry(): Promise<SitePluginRegistry> {
		if (previewPluginRegistryLoader) {
			return previewPluginRegistryLoader();
		}

		const nextKey = getPreviewPluginRegistryKey();

		if (!localPreviewPluginRegistryPromise || localPreviewPluginRegistryKey !== nextKey) {
			localPreviewPluginRegistryKey = nextKey;
			localPreviewPluginRegistryPromise = loadPluginRegistryForMode(
				getActiveRootConfig(),
				getPluginMode(),
				{ scopeKey: getPluginScopeKey() }
			);
		}

		return localPreviewPluginRegistryPromise;
	}

	const childPreviewPluginRegistryLoader: PreviewPluginRegistryLoader = () =>
		getPreviewPluginRegistry();

	$effect(() => {
		if (block.type !== 'markdown' || typeof value !== 'string') {
			previewMarkdown = typeof value === 'string' ? value : '';
			previewPluginError = null;
			return;
		}

		let cancelled = false;
		const markdownValue = value;

		async function loadPreviewMarkdown() {
			if ((block.plugins?.length ?? 0) === 0) {
				previewMarkdown = markdownValue;
				previewPluginError = null;
				return;
			}

			try {
				const registry = await getPreviewPluginRegistry();
				const enabledPlugins: UnifiedLocalPlugin[] = [];
				const errors: string[] = [];

				for (const pluginId of Array.from(new Set(block.plugins ?? []))) {
					const loadedPlugin = registry.get(pluginId);

					if (!loadedPlugin) {
						const loadError = registry.errors.find((error) => error.includes(`"${pluginId}"`));

						errors.push(
							loadError
								? `Markdown preview could not load plugin "${pluginId}": ${loadError}`
								: `Markdown preview enables plugin "${pluginId}", but it is not registered in root.plugins`
						);
						continue;
					}

					enabledPlugins.push(loadedPlugin.plugin);
				}

				if (!cancelled) {
					previewMarkdown = applyPreviewPluginTransforms(markdownValue, enabledPlugins);
					previewPluginError = errors.length > 0 ? errors.join(' ') : null;
				}
			} catch (error) {
				if (!cancelled) {
					previewMarkdown = markdownValue;
					previewPluginError =
						error instanceof Error ? error.message : 'Failed to load markdown preview plugins';
				}
			}
		}

		void loadPreviewMarkdown();

		return () => {
			cancelled = true;
		};
	});
</script>

{#if structuredBlocks}
	{#if structuredBlocks.collection}
		{#if !Array.isArray(value) || value.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
				<p class="text-sm text-gray-500">No items in this list</p>
			</div>
		{:else}
			<div class="mt-2 space-y-3">
				{#each value as item, index}
					<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
						<p class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
							Item {index + 1}
						</p>
						{#if item && typeof item === 'object' && !Array.isArray(item)}
							<dl class="space-y-3">
								{#each structuredBlocks.blocks as childBlock}
									<div class="flex flex-col gap-2 sm:flex-row sm:gap-3">
										<dt class="min-w-28 text-xs font-medium text-gray-600">
											{getBlockLabel(childBlock)}
										</dt>
										<dd class="flex-1 text-sm break-words text-gray-900">
											<ContentValueDisplay
												block={childBlock}
												value={(item as ContentRecord)[childBlock.id]}
												{blockRegistry}
												previewPluginRegistryLoader={childPreviewPluginRegistryLoader}
											/>
										</dd>
									</div>
								{/each}
							</dl>
						{:else}
							<span class="text-sm text-gray-900">{formatContentValue(item)}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{:else if value && typeof value === 'object' && !Array.isArray(value)}
		<dl class="space-y-3">
			{#each structuredBlocks.blocks as childBlock}
				<div class="flex flex-col gap-2 sm:flex-row sm:gap-3">
					<dt class="min-w-28 text-xs font-medium text-gray-600">
						{getBlockLabel(childBlock)}
					</dt>
					<dd class="flex-1 text-sm break-words text-gray-900">
						<ContentValueDisplay
							block={childBlock}
							value={(value as ContentRecord)[childBlock.id]}
							{blockRegistry}
							previewPluginRegistryLoader={childPreviewPluginRegistryLoader}
						/>
					</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<span class="text-sm">{formatContentValue(value)}</span>
	{/if}
{:else if block.type === 'markdown' && typeof value === 'string'}
	<div
		class="markdown-content prose max-w-none text-sm prose-stone prose-headings:font-semibold prose-code:rounded prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-stone-200 prose-pre:bg-stone-100 prose-pre:px-4 prose-pre:py-3 prose-pre:font-mono prose-pre:text-stone-800"
	>
		<SvelteMarkdown source={previewMarkdown} />
	</div>
	{#if previewPluginError}
		<div class="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
			<p class="font-medium">Preview plugin issue</p>
			<p class="mt-1 text-amber-800">{previewPluginError}</p>
		</div>
	{/if}
{:else if block.type === 'image' && typeof value === 'string' && value}
	<figure class="space-y-3">
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
			<AssetImage
				{value}
				alt={block.label ?? block.id}
				assetsDir={block.assetsDir}
				class="max-h-96 w-full bg-white object-contain"
				loading="lazy"
			/>
		</div>
		<figcaption class="font-mono text-xs break-all text-gray-500">{value}</figcaption>
	</figure>
{:else}
	<span class="text-sm">{formatContentValue(value)}</span>
{/if}

<style>
	:global(.markdown-content pre) {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		line-height: 1.6;
		tab-size: 2;
	}

	:global(.markdown-content pre code) {
		font: inherit;
		background: transparent;
		padding: 0;
		border-radius: 0;
	}

	:global(.markdown-content .tentman-preview-buy-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: rgb(5 150 105);
		padding: 0.55rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
		text-decoration: none;
	}

	:global(.markdown-content .tentman-preview-buy-button-secondary) {
		border: 1px solid rgb(87 83 78);
		background: white;
		color: rgb(41 37 36);
	}
</style>
