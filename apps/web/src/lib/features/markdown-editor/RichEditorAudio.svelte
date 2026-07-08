<script lang="ts">
	import { page } from '$app/state';
	import { getAssetRenderContext } from '$lib/features/assets/render-context';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';
	import {
		getPrimaryMediaSrc,
		normalizeMarkdownMediaAttrs
	} from '$lib/features/markdown-editor/media-node-markdown';
	import type { MarkdownMediaAttrs, MarkdownMediaSource } from './media-node-types';
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';

	interface Props {
		attrs: MarkdownMediaAttrs;
		assetsDir?: string;
		storagePath?: string;
	}

	let { attrs, assetsDir, storagePath }: Props = $props();

	let resolvedSrc = $state<string | null>(null);
	let resolvedSources = $state<MarkdownMediaSource[]>([]);
	let requestId = 0;

	const normalizedAttrs = $derived(normalizeMarkdownMediaAttrs(attrs));
	const fallbackLabel = $derived(
		getPrimaryMediaSrc(normalizedAttrs) ?? 'Audio preview unavailable'
	);

	$effect(() => {
		void assetsDir;
		void storagePath;
		const nextRequestId = ++requestId;
		const renderContext = getAssetRenderContext({
			selectedBackend: page.data.selectedBackend,
			selectedRepo: page.data.selectedRepo,
			rootConfig: page.data.rootConfig ?? null,
			localRootConfig: $localContent.rootConfig,
			localPreviewUrl: $localPreviewUrl,
			source: 'RichEditorAudio'
		});

		const sources = normalizedAttrs.sources ?? [];
		void Promise.all([
			resolveClientAssetUrl(normalizedAttrs.src, renderContext),
			Promise.all(
				sources.map(async (source) => ({
					...source,
					src: (await resolveClientAssetUrl(source.src, renderContext)) ?? source.src
				}))
			)
		]).then(([nextSrc, nextSources]) => {
			if (nextRequestId !== requestId) {
				return;
			}

			resolvedSrc = nextSrc;
			resolvedSources = nextSources;
		});
	});
</script>

<figure class="my-4 rounded-lg border border-stone-200 bg-stone-50 p-3">
	{#if resolvedSrc || resolvedSources.length > 0}
		<audio
			controls={normalizedAttrs.controls !== false}
			preload="metadata"
			src={resolvedSrc ?? undefined}
			title={normalizedAttrs.title ?? undefined}
			aria-label={normalizedAttrs.ariaLabel ?? undefined}
			class="w-full"
		>
			{#each resolvedSources as source}
				<source src={source.src} type={source.type ?? undefined} />
			{/each}
		</audio>
	{:else}
		<div
			class="flex min-h-20 items-center justify-center px-4 py-5 text-center text-sm text-stone-500"
		>
			<span class="break-all">{fallbackLabel}</span>
		</div>
	{/if}
</figure>
