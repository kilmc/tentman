<script lang="ts">
	import ReviewDraftItemCard from './ReviewDraftItemCard.svelte';
	import ReviewDraftOrderSection from './ReviewDraftOrderSection.svelte';
	import type { ReviewSection } from '$lib/features/review-draft/types';

	interface Props {
		section: ReviewSection;
		expanded: boolean;
		expandedItemIds: Set<string>;
		onToggleSection: () => void;
		onToggleItem: (itemId: string) => void;
	}

	let {
		section,
		expanded,
		expandedItemIds,
		onToggleSection,
		onToggleItem
	}: Props = $props();
</script>

<section class="rounded-2xl border border-stone-200 bg-white">
	<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-lg font-semibold text-stone-950">{section.configLabel}</h2>
				{#each section.badges as badge}
					<span
						class={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase ${
							badge.tone === 'danger'
								? 'bg-red-100 text-red-800'
								: badge.tone === 'accent'
									? 'bg-amber-100 text-amber-900'
									: 'bg-stone-100 text-stone-600'
						}`}
					>
						{badge.label}
					</span>
				{/each}
			</div>
			<a
				href={section.navigationHref}
				class="mt-2 inline-flex text-sm font-medium text-stone-600 hover:text-stone-950"
			>
				Open {section.isCollection ? 'collection' : 'page'}
			</a>
		</div>
		<button
			type="button"
			class="inline-flex items-center rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
			aria-label={`${expanded ? 'Collapse' : 'Expand'} ${section.configLabel}`}
			aria-expanded={expanded}
			onclick={onToggleSection}
		>
			{expanded ? 'Collapse' : 'Expand'}
		</button>
	</div>

	{#if expanded}
		<div class="space-y-4 border-t border-stone-200 p-4">
			{#if section.collectionOrderChange}
				<ReviewDraftOrderSection
					title="Collection order"
					review={section.collectionOrderChange}
					expanded={true}
				/>
			{/if}

			{#if section.items.length > 0}
				<div class="space-y-3">
					{#each section.items as item}
						<ReviewDraftItemCard
							{item}
							expanded={expandedItemIds.has(item.itemId)}
							onToggle={() => onToggleItem(item.itemId)}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>
