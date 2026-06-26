<script lang="ts">
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';
	import { getAssetRenderContext } from '$lib/features/assets/render-context';
	import { page } from '$app/state';

	interface Props {
		src: string;
		alt?: string | null;
		title?: string | null;
		assetsDir?: string;
		storagePath?: string;
	}

	let { src, alt = null, title = null, assetsDir, storagePath }: Props = $props();

	let resolvedSrc = $state<string | null>(null);
	let requestId = 0;

	$effect(() => {
		void assetsDir;
		void storagePath;
		const nextRequestId = ++requestId;
		const renderContext = getAssetRenderContext({
			selectedBackend: page.data.selectedBackend,
			selectedRepo: page.data.selectedRepo,
			rootConfig: page.data.rootConfig ?? null,
			localRootConfig: $localContent.rootConfig,
			localPreviewUrl: $localPreviewUrl
		});

		void resolveClientAssetUrl(src, renderContext).then((value) => {
			if (nextRequestId !== requestId) {
				return;
			}

			resolvedSrc = value;
		});
	});
</script>

<figure class="my-4 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
	{#if resolvedSrc}
		<img
			src={resolvedSrc}
			alt={alt ?? ''}
			title={title ?? undefined}
			class="h-auto w-full bg-white"
			draggable="false"
		/>
	{:else}
		<div class="flex min-h-32 items-center justify-center px-4 py-6 text-sm text-gray-500">
			Image preview unavailable
		</div>
	{/if}
</figure>
