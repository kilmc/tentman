<script lang="ts">
	import { localContent } from '$lib/stores/local-content';
	import { localPreviewUrl } from '$lib/stores/local-preview-url';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';
	import { getAssetRenderContext } from '$lib/features/assets/render-context';
	import { page } from '$app/state';

	interface Props {
		value: string | null | undefined;
		alt: string;
		class?: string;
		loading?: 'eager' | 'lazy';
	}

	let { value, alt, class: className = '', loading = 'lazy' }: Props = $props();

	let src = $state<string | null>(null);
	let loadRequest = 0;

	$effect(() => {
		const requestId = ++loadRequest;
		const nextValue = value;
		const renderContext = getAssetRenderContext({
			selectedBackend: page.data.selectedBackend,
			selectedRepo: page.data.selectedRepo,
			rootConfig: page.data.rootConfig ?? null,
			localRootConfig: $localContent.rootConfig,
			localPreviewUrl: $localPreviewUrl,
			source: 'AssetImage'
		});

		void resolveClientAssetUrl(nextValue, renderContext).then((resolved) => {
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
