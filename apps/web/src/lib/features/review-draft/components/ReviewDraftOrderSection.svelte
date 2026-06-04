<script lang="ts">
	import type { OrderChangeReview } from '$lib/features/review-draft/types';

	interface Props {
		title?: string;
		review: OrderChangeReview;
		expanded: boolean;
		onToggle?: () => void;
	}

	let { title, review, expanded, onToggle }: Props = $props();
	const resolvedTitle = $derived(title ?? review.title);
	const collapsible = $derived(typeof onToggle === 'function');
</script>

<section class="rounded-2xl border border-stone-200 bg-white">
	<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<p class="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">Order review</p>
			<h2 class="mt-1 text-lg font-semibold text-stone-950">{resolvedTitle}</h2>
			<a
				href={review.href}
				class="mt-2 inline-flex text-sm font-medium text-stone-600 hover:text-stone-950"
			>
				Open related content
			</a>
		</div>
		{#if collapsible}
			<button
				type="button"
				class="inline-flex items-center rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
				aria-label={`${expanded ? 'Collapse' : 'Expand'} ${resolvedTitle}`}
				aria-expanded={expanded}
				onclick={onToggle}
			>
				{expanded ? 'Collapse' : 'Expand'}
			</button>
		{/if}
	</div>

	{#if expanded}
		<div class="grid gap-4 border-t border-stone-200 p-4 md:grid-cols-2">
			<div class="rounded-2xl bg-stone-50 p-4">
				<p class="mb-3 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">Before</p>
				<ol class="space-y-2">
					{#each review.before as entry}
						<li class="flex items-baseline gap-3 text-sm text-stone-800">
							<span
								class="inline-flex min-w-6 justify-center rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500"
							>
								{entry.position}
							</span>
							<span>{entry.label}</span>
						</li>
					{/each}
				</ol>
			</div>
			<div class="rounded-2xl bg-stone-50 p-4">
				<p class="mb-3 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">After</p>
				<ol class="space-y-2">
					{#each review.after as entry}
						<li class="flex items-baseline gap-3 text-sm text-stone-800">
							<span
								class="inline-flex min-w-6 justify-center rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500"
							>
								{entry.position}
							</span>
							<span>{entry.label}</span>
						</li>
					{/each}
				</ol>
			</div>
		</div>
	{/if}
</section>
