<script lang="ts">
	import { page } from '$app/state';
	import { getAssetRenderContext } from '$lib/features/assets/render-context';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';
	import {
		getPrimaryMediaSrc,
		normalizeMarkdownMediaAttrs
	} from '$lib/features/markdown-editor/media-node-markdown';
	import type {
		MarkdownMediaAttrs,
		MarkdownMediaSource,
		MarkdownMediaTrack
	} from './media-node-types';
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';

	interface Props {
		attrs: MarkdownMediaAttrs;
		assetsDir?: string;
		storagePath?: string;
	}

	let { attrs, assetsDir, storagePath }: Props = $props();

	let resolvedSrc = $state<string | null>(null);
	let resolvedPoster = $state<string | null>(null);
	let resolvedSources = $state<MarkdownMediaSource[]>([]);
	let resolvedTracks = $state<MarkdownMediaTrack[]>([]);
	let requestId = 0;

	const normalizedAttrs = $derived(normalizeMarkdownMediaAttrs(attrs));
	const fallbackLabel = $derived(
		getPrimaryMediaSrc(normalizedAttrs) ?? 'Video preview unavailable'
	);

	function getTrackKind(kind: string | null | undefined) {
		return kind === 'subtitles' ||
			kind === 'captions' ||
			kind === 'descriptions' ||
			kind === 'chapters' ||
			kind === 'metadata'
			? kind
			: undefined;
	}

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
			source: 'RichEditorVideo'
		});

		const sources = normalizedAttrs.sources ?? [];
		const tracks = normalizedAttrs.tracks ?? [];
		void Promise.all([
			resolveClientAssetUrl(normalizedAttrs.src, renderContext),
			resolveClientAssetUrl(normalizedAttrs.poster, renderContext),
			Promise.all(
				sources.map(async (source) => ({
					...source,
					src: (await resolveClientAssetUrl(source.src, renderContext)) ?? source.src
				}))
			),
			Promise.all(
				tracks.map(async (track) => ({
					...track,
					src: (await resolveClientAssetUrl(track.src, renderContext)) ?? track.src
				}))
			)
		]).then(([nextSrc, nextPoster, nextSources, nextTracks]) => {
			if (nextRequestId !== requestId) {
				return;
			}

			resolvedSrc = nextSrc;
			resolvedPoster = nextPoster;
			resolvedSources = nextSources;
			resolvedTracks = nextTracks;
		});
	});
</script>

<figure class="my-4 overflow-hidden rounded-lg border border-stone-200 bg-stone-950">
	{#if resolvedSrc || resolvedSources.length > 0}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			controls={normalizedAttrs.controls !== false}
			preload="metadata"
			src={resolvedSrc ?? undefined}
			poster={resolvedPoster ?? undefined}
			title={normalizedAttrs.title ?? undefined}
			aria-label={normalizedAttrs.ariaLabel ?? undefined}
			class="aspect-video w-full bg-stone-950 object-contain"
		>
			{#each resolvedSources as source}
				<source src={source.src} type={source.type ?? undefined} />
			{/each}
			{#each resolvedTracks as track}
				<track
					src={track.src}
					kind={getTrackKind(track.kind)}
					label={track.label ?? undefined}
					srclang={track.srclang ?? undefined}
					default={track.default}
				/>
			{/each}
		</video>
	{:else}
		<div
			class="flex aspect-video items-center justify-center px-4 py-8 text-center text-sm text-stone-300"
		>
			<span class="break-all">{fallbackLabel}</span>
		</div>
	{/if}
</figure>
