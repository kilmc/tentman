<script lang="ts">
	import { localContent } from '$lib/stores/local-content';
	import { resolveClientAssetUrl } from '$lib/features/draft-assets/image-resolver';

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
		const nextAssetsDir = assetsDir;
		const previewBaseUrl = $localContent.rootConfig?.local?.previewUrl;

		void resolveClientAssetUrl(nextValue, {
			assetsDir: nextAssetsDir,
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
	<img {src} {alt} class={className} {loading} />
{/if}
