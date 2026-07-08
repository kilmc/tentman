<script lang="ts">
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import AssetImage from '$lib/components/AssetImage.svelte';
	import { loadContentComponentRegistryForMode } from '$lib/content-components/browser';
	import { getUnknownEnabledContentComponentErrors } from '$lib/content-components/availability';
	import { filterContentComponentRegistry } from '$lib/content-components/registry';
	import { applyAuthoringContentComponentTransforms } from '$lib/content-components/authoring';
	import { collectContentComponentReferenceState } from '$lib/content-components/references';
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';
	import ContentValueDisplay from './ContentValueDisplay.svelte';
	import MarkdownAudioRenderer from './MarkdownAudioRenderer.svelte';
	import MarkdownVideoRenderer from './MarkdownVideoRenderer.svelte';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { getStructuredBlocksForUsage } from '$lib/blocks/registry';
	import type { BlockUsage } from '$lib/config/types';
	import { getAssetRenderContext } from '$lib/features/assets/render-context';
	import { resolveMarkdownAssetUrls } from '$lib/features/draft-assets/markdown-asset-resolver';
	import { formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

	interface Props {
		block: BlockUsage;
		value: ContentValue | undefined;
		blockRegistry: BlockRegistry;
		rootBlocks?: BlockUsage[];
		rootContentItem?: ContentRecord | null;
	}

	let {
		block,
		value,
		blockRegistry,
		rootBlocks = undefined,
		rootContentItem = null
	}: Props = $props();
	let renderedMarkdown = $state('');
	let contentComponentIssue = $state<string | null>(null);

	const structuredBlocks = $derived(getStructuredBlocksForUsage(block, blockRegistry));

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

	function getComponentMode(): 'local' | 'github' {
		return page.data.selectedBackend?.kind === 'local' ? 'local' : 'github';
	}

	function getComponentScopeKey(): string {
		if (page.data.selectedBackend?.kind === 'local') {
			return `local:${page.data.selectedBackend.repo.pathLabel}`;
		}

		if (page.data.selectedRepo) {
			return `github:${page.data.selectedRepo.owner}/${page.data.selectedRepo.name}`;
		}

		return getComponentMode();
	}

	function getActiveComponentsDir(): string | undefined {
		return getActiveRootConfig()?.componentsDir;
	}

	function getReferencePreviewOptions() {
		if (!rootBlocks?.length || !rootContentItem) {
			return {
				contentItem: null,
				referenceIndex: new Map<string, Map<string, unknown>>(),
				errors: [] as string[]
			};
		}

		const referenceState = collectContentComponentReferenceState({
			blocks: rootBlocks,
			contentItem: rootContentItem,
			blockRegistry
		});

		return {
			contentItem: rootContentItem,
			referenceIndex: referenceState.referenceIndex as Map<string, Map<string, unknown>>,
			errors: referenceState.errors
		};
	}

	$effect(() => {
		if (block.type !== 'markdown' || typeof value !== 'string') {
			renderedMarkdown = typeof value === 'string' ? value : '';
			contentComponentIssue = null;
			return;
		}

		let cancelled = false;
		const markdownValue = value;
		renderedMarkdown = markdownValue;
		contentComponentIssue = null;

		async function loadRenderedMarkdown() {
			try {
				const errors: string[] = [];
				let nextMarkdown = markdownValue;
				const referencePreviewOptions = getReferencePreviewOptions();

				const componentRegistry = await loadContentComponentRegistryForMode(getComponentMode(), {
					scopeKey: getComponentScopeKey(),
					componentsDir: getActiveComponentsDir()
				});
				const enabledComponentRegistry = filterContentComponentRegistry(
					componentRegistry,
					block.components
				);
				const discoveredNames = new Set(
					componentRegistry.components.map((component) => component.definition.name)
				);
				errors.push(
					...getUnknownEnabledContentComponentErrors(
						block.components,
						discoveredNames,
						'Markdown field enables'
					)
				);
				errors.push(...referencePreviewOptions.errors);
				const componentMarkup = applyAuthoringContentComponentTransforms(
					nextMarkdown,
					enabledComponentRegistry,
					{
						availableRegistry: componentRegistry,
						contentItem: referencePreviewOptions.contentItem,
						referenceIndex: referencePreviewOptions.referenceIndex
					}
				);
				nextMarkdown = componentMarkup.markdown;
				errors.push(...componentMarkup.errors);
				nextMarkdown = await resolveMarkdownAssetUrls(
					nextMarkdown,
					getAssetRenderContext({
						selectedBackend: page.data.selectedBackend,
						selectedRepo: page.data.selectedRepo,
						rootConfig: page.data.rootConfig ?? null,
						localRootConfig: get(localContent).rootConfig,
						localPreviewUrl: get(localPreviewUrl),
						source: 'ContentValueDisplay'
					})
				);

				if (!cancelled) {
					renderedMarkdown = nextMarkdown;
					contentComponentIssue = errors.length > 0 ? errors.join(' ') : null;
				}
			} catch (error) {
				if (!cancelled) {
					renderedMarkdown = markdownValue;
					contentComponentIssue =
						error instanceof Error
							? error.message
							: 'Failed to process markdown content components';
				}
			}
		}

		void loadRenderedMarkdown();

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
												{rootBlocks}
												{rootContentItem}
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
							{rootBlocks}
							{rootContentItem}
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
		{#key renderedMarkdown}
			<SvelteMarkdown
				source={renderedMarkdown}
				renderers={{
					html: {
						audio: MarkdownAudioRenderer,
						video: MarkdownVideoRenderer
					}
				}}
			/>
		{/key}
	</div>
	{#if contentComponentIssue}
		<div class="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
			<p class="font-medium">Content component issue</p>
			<p class="mt-1 text-amber-800">{contentComponentIssue}</p>
		</div>
	{/if}
{:else if block.type === 'image' && typeof value === 'string' && value}
	<figure class="space-y-3">
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
			<AssetImage
				{value}
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
