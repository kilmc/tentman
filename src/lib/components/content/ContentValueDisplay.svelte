<script lang="ts">
	import ContentValueDisplay from './ContentValueDisplay.svelte';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
	import type { BlockUsage } from '$lib/config/types';
	import { formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
	import { localContent } from '$lib/stores/local-content';
	import { resolveAssetValue } from '$lib/utils/assets';

	interface Props {
		block: BlockUsage;
		value: ContentValue | undefined;
		blockRegistry: BlockRegistry;
	}

	let { block, value, blockRegistry }: Props = $props();

	const structuredBlocks = getStructuredBlocksForUsage(block, blockRegistry);
	const resolvedImageSrc = $derived(
		block.type === 'image' && typeof value === 'string'
			? resolveAssetValue(value, {
					assetsDir: block.assetsDir,
					previewBaseUrl: $localContent.rootConfig?.local?.previewUrl
				})
			: null
	);

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
						/>
					</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<span class="text-sm">{formatContentValue(value)}</span>
	{/if}
{:else if block.type === 'markdown' && typeof value === 'string'}
	<div class="prose max-w-none font-mono text-sm whitespace-pre-wrap">
		{formatContentValue(value)}
	</div>
{:else if block.type === 'image' && typeof value === 'string' && value && resolvedImageSrc}
	<figure class="space-y-3">
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
			<img
				src={resolvedImageSrc}
				alt={block.label ?? block.id}
				class="max-h-96 w-full bg-white object-contain"
				loading="lazy"
			/>
		</div>
		<figcaption class="font-mono text-xs break-all text-gray-500">{value}</figcaption>
	</figure>
{:else}
	<span class="text-sm">{formatContentValue(value)}</span>
{/if}
