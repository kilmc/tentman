<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { draftBranch as draftBranchStore } from '$lib/stores/draft-branch';
	import { formatAppTitle } from '$lib/utils/page-title';
	import ReviewDraftOrderSection from '$lib/features/review-draft/components/ReviewDraftOrderSection.svelte';
	import ReviewDraftOtherChanges from '$lib/features/review-draft/components/ReviewDraftOtherChanges.svelte';
	import ReviewDraftSection from '$lib/features/review-draft/components/ReviewDraftSection.svelte';
	import { createDiscardEnhanceHandler, createPublishEnhanceHandler } from './form-behavior';
	import type { ReviewSection } from '$lib/features/review-draft/types';

	let { data }: { data: PageData } = $props();
	let publishing = $state(false);
	let discarding = $state(false);
	const reviewModel = $derived(data.reviewModel);

	const confirmDiscard = () =>
		confirm('Are you sure you want to discard all draft changes? This cannot be undone.');

	const siteName = $derived(data.rootConfig?.siteName ?? data.selectedRepo?.name ?? null);
	const sectionSlugs = $derived(reviewModel.sections.map((section: ReviewSection) => section.configSlug));
	let expandedSections = $state<string[]>([]);
	let expandedItems = $state<Record<string, string[]>>({});
	let topLevelExpanded = $state(false);
	let otherChangesExpanded = $state(false);
	let initialized = $state(false);

	$effect(() => {
		if (initialized) {
			return;
		}

		expandedSections = reviewModel.sections
			.filter((section: ReviewSection) => section.defaultExpanded)
			.map((section: ReviewSection) => section.configSlug);
		expandedItems = Object.fromEntries(
			reviewModel.sections.map((section: ReviewSection) => [
				section.configSlug,
				section.items.filter((item) => item.defaultExpanded).map((item) => item.itemId)
			])
		) as Record<string, string[]>;
		topLevelExpanded = Boolean(reviewModel.topLevelOrderChange);
		otherChangesExpanded = Boolean(reviewModel.otherSiteChanges?.defaultExpanded);
		initialized = true;
	});

	function toggleSection(sectionSlug: string) {
		expandedSections = expandedSections.includes(sectionSlug)
			? expandedSections.filter((slug) => slug !== sectionSlug)
			: [...expandedSections, sectionSlug];
	}

	function toggleItem(sectionSlug: string, itemId: string) {
		const current = expandedItems[sectionSlug] ?? [];
		expandedItems = {
			...expandedItems,
			[sectionSlug]: current.includes(itemId)
				? current.filter((candidate) => candidate !== itemId)
				: [...current, itemId]
		};
	}

	function expandAll() {
		expandedSections = [...sectionSlugs];
		expandedItems = Object.fromEntries(
			reviewModel.sections.map((section: ReviewSection) => [
				section.configSlug,
				section.items.map((item) => item.itemId)
			])
		) as Record<string, string[]>;
		topLevelExpanded = Boolean(data.reviewModel.topLevelOrderChange);
		otherChangesExpanded = Boolean(data.reviewModel.otherSiteChanges);
	}

	function collapseAll() {
		expandedSections = [];
		expandedItems = Object.fromEntries(
			reviewModel.sections.map((section: ReviewSection) => [section.configSlug, []])
		) as Record<string, string[]>;
		topLevelExpanded = false;
		otherChangesExpanded = false;
	}
</script>

<svelte:head>
	<title>{formatAppTitle('Review Draft', siteName)}</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6">
	<div class="rounded-3xl border border-stone-200 bg-white p-6">
		<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
			<div class="max-w-2xl">
				<h1 class="text-3xl font-bold tracking-[-0.03em] text-stone-950">Review Draft</h1>
				<p class="mt-3 text-stone-600">
					Review what will go live from this managed GitHub draft before you publish.
				</p>
				<p class="mt-2 text-sm text-stone-500">
					The review stays Tentman-focused: changed content, authored order, and a narrow fallback
					for related site files that could not be mapped cleanly.
				</p>
			</div>

			<div class="flex flex-col gap-3 lg:min-w-72">
				<form
					method="POST"
					action="?/publish"
					use:enhance={createPublishEnhanceHandler(draftBranchStore, (value) => (publishing = value))}
				>
					<button
						type="submit"
						disabled={publishing || discarding}
						class="w-full rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
					>
						{publishing ? 'Publishing...' : 'Publish Draft'}
					</button>
				</form>

				<form
					method="POST"
					action="?/discard"
					use:enhance={createDiscardEnhanceHandler(
						draftBranchStore,
						(value) => (discarding = value),
						confirmDiscard
					)}
				>
					<button
						type="submit"
						disabled={publishing || discarding}
						class="w-full rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
					>
						{discarding ? 'Discarding...' : 'Discard Changes'}
					</button>
				</form>

				<a
					href="/pages"
					class="w-full rounded-xl border border-stone-300 bg-white px-5 py-3 text-center text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100"
				>
					Cancel
				</a>
			</div>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<button
			type="button"
			class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
			onclick={expandAll}
		>
			Expand all
		</button>
		<button
			type="button"
			class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
			onclick={collapseAll}
		>
			Collapse all
		</button>
	</div>

	<div class="space-y-4">
		{#if reviewModel.topLevelOrderChange}
			<ReviewDraftOrderSection
				review={reviewModel.topLevelOrderChange}
				expanded={topLevelExpanded}
				onToggle={() => (topLevelExpanded = !topLevelExpanded)}
			/>
		{/if}

		{#each reviewModel.sections as section}
			<ReviewDraftSection
				{section}
				expanded={expandedSections.includes(section.configSlug)}
				expandedItemIds={new Set(expandedItems[section.configSlug] ?? [])}
				onToggleSection={() => toggleSection(section.configSlug)}
				onToggleItem={(itemId) => toggleItem(section.configSlug, itemId)}
			/>
		{/each}

		{#if reviewModel.otherSiteChanges}
			<ReviewDraftOtherChanges
				review={reviewModel.otherSiteChanges}
				expanded={otherChangesExpanded}
				onToggle={() => (otherChangesExpanded = !otherChangesExpanded)}
				hasHiddenUnreviewedChanges={reviewModel.hasHiddenUnreviewedChanges}
			/>
		{:else if reviewModel.hasHiddenUnreviewedChanges}
			<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				This GitHub draft also contains other repo changes outside this Tentman-focused review.
			</div>
		{:else if !reviewModel.topLevelOrderChange && reviewModel.sections.length === 0}
			<div class="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
				No Tentman-visible changes were found in this draft.
			</div>
		{/if}
	</div>
</div>
