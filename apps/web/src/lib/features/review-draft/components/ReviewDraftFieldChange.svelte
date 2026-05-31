<script lang="ts">
	import ReviewDraftFieldChange from './ReviewDraftFieldChange.svelte';
	import type { ReviewDiffLine, ReviewDiffSegment, ReviewFieldChange } from '$lib/features/review-draft/types';

	interface Props {
		field: ReviewFieldChange;
	}

	let { field }: Props = $props();
	let expanded = $state(false);

	$effect(() => {
		expanded = field.defaultExpanded;
	});

	function segmentClass(status: ReviewDiffSegment['status']): string {
		switch (status) {
			case 'added':
				return 'bg-emerald-100 text-emerald-950';
			case 'removed':
				return 'bg-red-100 text-red-900 line-through';
			default:
				return 'text-stone-800';
		}
	}

	function lineClass(status: ReviewDiffLine['status']): string {
		switch (status) {
			case 'added':
				return 'bg-emerald-50 text-emerald-950';
			case 'removed':
				return 'bg-red-50 text-red-900';
			default:
				return 'text-stone-800';
		}
	}
</script>

<div class="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
	<div class="mb-3 flex items-start justify-between gap-3">
		<h4 class="text-sm font-semibold text-stone-950">{field.label}</h4>
		{#if 'isLong' in field.presentation && field.presentation.isLong}
			<button
				type="button"
				class="text-xs font-medium text-stone-500 hover:text-stone-900"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? 'Hide details' : 'Show details'}
			</button>
		{/if}
	</div>

	{#if expanded}
		{#if field.presentation.kind === 'text' || field.presentation.kind === 'markdown'}
			{#if field.presentation.diffMode === 'inline'}
				<div class="grid gap-3 md:grid-cols-2">
					<div>
						<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">Before</p>
						<p class="rounded-xl bg-white p-3 text-sm leading-6">
							{#each field.presentation.beforeSegments ?? [] as segment}
								<span class={segmentClass(segment.status)}>{segment.value}</span>
							{/each}
						</p>
					</div>
					<div>
						<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">After</p>
						<p class="rounded-xl bg-white p-3 text-sm leading-6">
							{#each field.presentation.afterSegments ?? [] as segment}
								<span class={segmentClass(segment.status)}>{segment.value}</span>
							{/each}
						</p>
					</div>
				</div>
			{:else if field.presentation.diffMode === 'lines'}
				<div class="grid gap-3 md:grid-cols-2">
					<div>
						<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">Before</p>
						<pre class="overflow-x-auto rounded-xl bg-white p-3 text-sm leading-6 whitespace-pre-wrap break-words">{#each field.presentation.beforeLines ?? [] as line}<span class={lineClass(line.status)}>{line.value}{'\n'}</span>{/each}</pre>
					</div>
					<div>
						<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">After</p>
						<pre class="overflow-x-auto rounded-xl bg-white p-3 text-sm leading-6 whitespace-pre-wrap break-words">{#each field.presentation.afterLines ?? [] as line}<span class={lineClass(line.status)}>{line.value}{'\n'}</span>{/each}</pre>
					</div>
				</div>
			{:else}
				<div class="grid gap-3 md:grid-cols-2">
					<div class="rounded-xl bg-white p-3 text-sm text-stone-800">{field.presentation.before ?? '—'}</div>
					<div class="rounded-xl bg-white p-3 text-sm text-stone-800">{field.presentation.after ?? '—'}</div>
				</div>
			{/if}
		{:else if field.presentation.kind === 'value'}
			<div class="grid gap-3 md:grid-cols-2">
				<div class="rounded-xl bg-white p-3 text-sm text-stone-800">{field.presentation.before ?? '—'}</div>
				<div class="rounded-xl bg-white p-3 text-sm text-stone-800">{field.presentation.after ?? '—'}</div>
			</div>
		{:else if field.presentation.kind === 'media'}
			<div class="grid gap-3 md:grid-cols-2">
				{#each [
					{ label: 'Before', value: field.presentation.before },
					{ label: 'After', value: field.presentation.after }
				] as side}
					<div>
						<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">{side.label}</p>
						<div class="rounded-xl bg-white p-3">
							{#if side.value?.previewUrl}
								<img
									src={side.value.previewUrl}
									alt={field.label}
									class="mb-3 max-h-44 w-full rounded-lg border border-stone-200 object-contain"
								/>
							{/if}
							<p class="text-sm text-stone-800">{side.value?.value ?? '—'}</p>
						</div>
					</div>
				{/each}
			</div>
		{:else if field.presentation.kind === 'object'}
			<div class="grid gap-3 md:grid-cols-2">
				{#each [
					{ label: 'Before', rows: field.presentation.before },
					{ label: 'After', rows: field.presentation.after }
				] as side}
					<div class="rounded-xl bg-white p-3">
						<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">{side.label}</p>
						{#if side.rows.length === 0}
							<p class="text-sm text-stone-500">No value</p>
						{:else}
							<dl class="space-y-2">
								{#each side.rows as row}
									<div>
										<dt class="text-xs font-semibold text-stone-500">{row.label}</dt>
										<dd class="text-sm text-stone-800">{row.value}</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</div>
				{/each}
			</div>
		{:else if field.presentation.kind === 'structured'}
			{#if field.presentation.mode === 'context'}
				<div class="grid gap-3 md:grid-cols-2">
					{#each [
						{ label: 'Before', items: field.presentation.beforeSummary ?? [] },
						{ label: 'After', items: field.presentation.afterSummary ?? [] }
					] as side}
						<div class="rounded-xl bg-white p-3">
							<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">{side.label}</p>
							<ol class="space-y-2">
								{#each side.items as item, index}
									<li class="text-sm text-stone-800">{index + 1}. {item}</li>
								{/each}
							</ol>
						</div>
					{/each}
				</div>
			{:else}
				<div class="space-y-3">
					{#each field.presentation.entries ?? [] as entry}
						<div class="rounded-xl bg-white p-3">
							<div class="mb-3 flex flex-wrap items-center gap-2">
								<h5 class="text-sm font-semibold text-stone-900">{entry.title}</h5>
								{#each entry.changeKinds as kind}
									<span class="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600 uppercase">
										{kind}
									</span>
								{/each}
							</div>
							{#if entry.fields?.length}
								<div class="space-y-3">
									{#each entry.fields as nestedField}
										<ReviewDraftFieldChange field={nestedField} />
									{/each}
								</div>
							{:else if entry.beforeSummary || entry.afterSummary}
								<div class="grid gap-3 md:grid-cols-2">
									<div class="rounded-xl bg-stone-50 p-3 text-sm text-stone-800">{entry.beforeSummary ?? '—'}</div>
									<div class="rounded-xl bg-stone-50 p-3 text-sm text-stone-800">{entry.afterSummary ?? '—'}</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</div>
