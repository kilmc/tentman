<script lang="ts">
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';
	import { page } from '$app/state';

	interface Props {
		value: string | null | undefined;
		alt: string;
		assetsDir?: string;
		class?: string;
		loading?: 'eager' | 'lazy';
	}

	let { value, alt, assetsDir, class: className = '', loading = 'lazy' }: Props = $props();

	let src = $state<string | null>(null);
	let loadRequest = 0;

	$effect(() => {
		const requestId = ++loadRequest;
		const nextValue = value;
		const previewBaseUrl = $localPreviewUrl ?? $localContent.rootConfig?.local?.previewUrl;
		const assets = $localContent.rootConfig?.assets ?? page.data.rootConfig?.assets;

		void resolveClientAssetUrl(nextValue, {
			assets,
			previewBaseUrl
		}).then((resolved) => {
			if (requestId !== loadRequest) {
				return;
			}

			src = resolved;
		});
	});
</script>

{#if src}
	<img {src} {alt} class={`block ${className}`} width="128" height="128" {loading} />
{/if}
