<script lang="ts">
	import type { OtherSiteChangesReview } from '$lib/features/review-draft/types';

	interface Props {
		review: OtherSiteChangesReview;
		expanded: boolean;
		onToggle: () => void;
		hasHiddenUnreviewedChanges: boolean;
	}

	let { review, expanded, onToggle, hasHiddenUnreviewedChanges }: Props = $props();
</script>

<section class="rounded-2xl border border-stone-200 bg-white">
	<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-lg font-semibold text-stone-950">{review.title}</h2>
			<p class="mt-2 text-sm text-stone-600">
				Tentman-related draft files that could not be shown as item review cards still appear here.
			</p>
			{#if hasHiddenUnreviewedChanges}
				<p class="mt-2 text-sm text-amber-900">
					This GitHub draft also contains other repo changes outside this Tentman-focused review.
				</p>
			{/if}
		</div>
		<button
			type="button"
			class="inline-flex items-center rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
			aria-label={`${expanded ? 'Collapse' : 'Expand'} ${review.title}`}
			aria-expanded={expanded}
			onclick={onToggle}
		>
			{expanded ? 'Collapse' : 'Expand'}
		</button>
	</div>

	{#if expanded}
		<div class="border-t border-stone-200 p-4">
			<ul class="space-y-2">
				{#each review.files as file}
					<li class="flex flex-wrap items-center gap-2 text-sm text-stone-800">
						<span
							class="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-stone-600 uppercase"
						>
							{file.status}
						</span>
						<code>{file.path}</code>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
