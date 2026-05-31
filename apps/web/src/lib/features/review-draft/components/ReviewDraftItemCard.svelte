<script lang="ts">
	import ReviewDraftFieldChange from './ReviewDraftFieldChange.svelte';
	import type { ReviewItemCard } from '$lib/features/review-draft/types';

	interface Props {
		item: ReviewItemCard;
		expanded: boolean;
		onToggle: () => void;
	}

	let { item, expanded, onToggle }: Props = $props();

	function moveSummary(item: ReviewItemCard): string | null {
		if (
			typeof item.beforePosition !== 'number' ||
			typeof item.afterPosition !== 'number' ||
			item.beforePosition === item.afterPosition
		) {
			return null;
		}

		return `Moved from ${item.beforePosition} to ${item.afterPosition}`;
	}
</script>

<article class="rounded-2xl border border-stone-200 bg-white">
	<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<h4 class="text-base font-semibold text-stone-950">{item.title}</h4>
				{#each item.changeKinds as kind}
					<span class="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-stone-600 uppercase">
						{kind}
					</span>
				{/each}
			</div>
			{#if moveSummary(item)}
				<p class="mt-2 text-sm text-stone-500">{moveSummary(item)}</p>
			{/if}
			<a href={item.href} class="mt-2 inline-flex text-sm font-medium text-stone-600 hover:text-stone-950">
				Open item
			</a>
		</div>
		<button
			type="button"
			class="inline-flex items-center rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
			aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.title}`}
			aria-expanded={expanded}
			onclick={onToggle}
		>
			{expanded ? 'Collapse' : 'Expand'}
		</button>
	</div>

	{#if expanded}
		<div class="space-y-3 border-t border-stone-200 p-4">
			{#if item.fields.length === 0}
				<p class="text-sm text-stone-500">This change only affects placement in the final order.</p>
			{:else}
				{#each item.fields as field}
					<ReviewDraftFieldChange {field} />
				{/each}
			{/if}
		</div>
	{/if}
</article>
