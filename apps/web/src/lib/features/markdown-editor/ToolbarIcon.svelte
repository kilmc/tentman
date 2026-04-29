<script lang="ts">
	interface Props {
		name: string;
		class?: string;
	}

	let { name, class: className = 'size-4' }: Props = $props();
</script>

{#if name === 'paragraph'}
	<span
		class="{className} inline-flex items-center justify-center text-[11px] leading-none font-semibold"
	>
		P
	</span>
{:else if name === 'heading1'}
	<span
		class="{className} inline-flex items-center justify-center text-[11px] leading-none font-semibold"
	>
		H1
	</span>
{:else if name === 'heading2'}
	<span
		class="{className} inline-flex items-center justify-center text-[11px] leading-none font-semibold"
	>
		H2
	</span>
{:else if name === 'heading3'}
	<span
		class="{className} inline-flex items-center justify-center text-[11px] leading-none font-semibold"
	>
		H3
	</span>
{:else if name === 'bold'}
	<span class="{className} inline-flex items-center justify-center text-sm leading-none font-bold">
		B
	</span>
{:else if name === 'italic'}
	<span class="{className} inline-flex items-center justify-center text-sm leading-none italic">
		I
	</span>
{:else if name === 'strike'}
	<span
		class="{className} inline-flex items-center justify-center text-sm leading-none line-through"
	>
		S
	</span>
{:else if name === 'code'}
	<span
		class="{className} inline-flex items-center justify-center text-[10px] leading-none font-semibold"
	>
		&lt;/&gt;
	</span>
{:else if name === 'bulletList'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<circle cx="3" cy="4" r="1" fill="currentColor"></circle>
		<circle cx="3" cy="8" r="1" fill="currentColor"></circle>
		<circle cx="3" cy="12" r="1" fill="currentColor"></circle>
		<path d="M6 4h7M6 8h7M6 12h7"></path>
	</svg>
{:else if name === 'orderedList'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="M2.5 3.25h1v3M2.25 6.25h2"></path>
		<path d="M2.25 9.5c0-.69.56-1.25 1.25-1.25s1.25.56 1.25 1.25c0 .4-.18.76-.47 1l-1.78 1.5H4.75"
		></path>
		<path d="M6.5 4h7M6.5 8h7M6.5 12h7"></path>
	</svg>
{:else if name === 'blockquote'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path
			d="M5.5 4.5h-2v3h2V12h-4V7.5A3.5 3.5 0 0 1 5 4h.5zM12.5 4.5h-2v3h2V12h-4V7.5A3.5 3.5 0 0 1 12 4h.5z"
		></path>
	</svg>
{:else if name === 'codeBlock'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="M6 4 3.5 8 6 12M10 4l2.5 4-2.5 4M8.5 3.5 7 12.5"></path>
	</svg>
{:else if name === 'divider'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="M2 8h12"></path>
		<path d="M4 5.5h8M4 10.5h8" opacity="0.45"></path>
	</svg>
{:else if name === 'link'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="M6.25 9.75 9.75 6.25"></path>
		<path d="M5.25 11.75H4A2.75 2.75 0 0 1 4 6.25h1.75"></path>
		<path d="M10.75 4.25H12A2.75 2.75 0 1 1 12 9.75h-1.75"></path>
	</svg>
{:else if name === 'image'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<rect x="2.25" y="3" width="11.5" height="10" rx="1.5"></rect>
		<circle cx="5.5" cy="6" r="1"></circle>
		<path d="m3.75 11 2.75-2.75 2 2 1.5-1.5 2.25 2.25"></path>
	</svg>
{:else if name === 'chevronDown'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="m4 6 4 4 4-4"></path>
	</svg>
{:else if name === 'check'}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="m3.5 8.5 2.5 2.5 6-6"></path>
	</svg>
{/if}
