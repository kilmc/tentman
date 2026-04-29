<script lang="ts">
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';

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
		const nextRequestId = ++requestId;
		const previewBaseUrl = $localPreviewUrl ?? $localContent.rootConfig?.local?.previewUrl;

		void resolveClientAssetUrl(src, {
			assetsDir: assetsDir ?? storagePath,
			previewBaseUrl
		}).then((value) => {
			if (nextRequestId !== requestId) {
				return;
			}

			resolvedSrc = value;
		});
	});
</script>

<figure class="my-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
	{#if resolvedSrc}
		<img
			src={resolvedSrc}
			alt={alt ?? ''}
			title={title ?? undefined}
			class="max-h-80 w-full bg-white object-contain"
			draggable="false"
		/>
	{:else}
		<div class="flex min-h-32 items-center justify-center px-4 py-6 text-sm text-gray-500">
			Image preview unavailable
		</div>
	{/if}
</figure>
