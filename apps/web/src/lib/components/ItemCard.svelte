<script lang="ts">
	import AssetImage from '$lib/components/AssetImage.svelte';
	import type { BlockUsage } from '$lib/config/types';
	import { formatContentValue } from '$lib/features/content-management/item';
	import {
		getStateBadgeClassName,
		type ResolvedContentState
	} from '$lib/features/content-management/state';
	import type { ContentRecord } from '$lib/features/content-management/types';

	interface Props {
		item: ContentRecord;
		href: string;
		cardFields: {
			primary: BlockUsage[];
			secondary: BlockUsage[];
		};
		badge?: 'draft' | 'new' | 'deleted';
		state?: ResolvedContentState | null;
	}

	let { item, href, cardFields, badge, state = null }: Props = $props();

	const allFields = $derived([...cardFields.primary, ...cardFields.secondary]);
	const heroImageBlock = $derived(
		allFields.find(
			(block) => block.type === 'image' && typeof item[block.id] === 'string' && item[block.id]
		)
	);
	const visiblePrimaryFields = $derived(
		cardFields.primary.filter((block) => block !== heroImageBlock)
	);
	const visibleSecondaryFields = $derived(
		cardFields.secondary.filter((block) => block !== heroImageBlock)
	);

	function getBlockLabel(block: BlockUsage) {
		return (
			block.label ??
			block.id
				.replace(/([A-Z])/g, ' $1')
				.replace(/_/g, ' ')
				.replace(/^./, (str) => str.toUpperCase())
				.trim()
		);
	}

	function getBadgeStyles(badgeType: 'draft' | 'new' | 'deleted') {
		switch (badgeType) {
			case 'draft':
				return 'border-stone-300 bg-stone-100 text-stone-700';
			case 'new':
				return 'border-stone-300 bg-stone-900 text-white';
			case 'deleted':
				return 'border-red-200 bg-red-50 text-red-700';
		}
	}

	function getBadgeLabel(badgeType: 'draft' | 'new' | 'deleted') {
		switch (badgeType) {
			case 'draft':
				return 'Draft change';
			case 'new':
				return 'New';
			case 'deleted':
				return 'Deleted';
		}
	}

	function getStatusBadges() {
		const badges: Array<{ label: string; className: string }> = [];

		if (state && state.visibility.card !== false) {
			badges.push({
				label: state.label,
				className: getStateBadgeClassName(state.variant)
			});
		}

		if (badge) {
			badges.push({
				label: getBadgeLabel(badge),
				className: getBadgeStyles(badge)
			});
		}

		return badges;
	}

	const statusBadges = $derived(getStatusBadges());
</script>

<a
	{href}
	class="block cursor-pointer rounded-md border border-stone-200 bg-white p-4 transition-colors duration-200 hover:border-stone-400 hover:bg-stone-50"
>
	{#if heroImageBlock}
		<div class="mb-3 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
			<AssetImage
				value={String(item[heroImageBlock.id])}
				alt={heroImageBlock.label ?? 'Content image'}
				assetsDir={heroImageBlock.assetsDir}
				class="h-40 w-full object-cover"
				loading="lazy"
			/>
		</div>
	{/if}

	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			{#if visiblePrimaryFields.length > 0}
				<div class="space-y-0.5">
					{#each visiblePrimaryFields as block}
						<h3 class="text-base font-semibold break-words text-stone-950">
							{formatContentValue(item[block.id])}
						</h3>
					{/each}
				</div>
			{/if}

			{#if visibleSecondaryFields.length > 0}
				<div class="mt-2 space-y-1">
					{#each visibleSecondaryFields as block}
						{#if block.type === 'image' && typeof item[block.id] === 'string' && item[block.id]}
							<div class="flex items-center gap-3 text-sm text-stone-600">
								<AssetImage
									value={String(item[block.id])}
									alt={getBlockLabel(block)}
									assetsDir={block.assetsDir}
									class="h-11 w-11 rounded-md border border-stone-200 object-cover"
									loading="lazy"
								/>
								<div class="min-w-0">
									<p class="font-medium text-stone-700">{getBlockLabel(block)}</p>
									<p class="truncate text-xs text-stone-500">{String(item[block.id])}</p>
								</div>
							</div>
						{:else}
							<p class="text-sm text-stone-600">
								<span class="font-medium">{getBlockLabel(block)}:</span>
								{formatContentValue(item[block.id])}
							</p>
						{/if}
					{/each}
				</div>
			{/if}

			{#if item._filename}
				<p class="mt-3 font-mono text-xs text-stone-400">{item._filename}</p>
			{/if}
		</div>

		{#if statusBadges.length > 0}
			<div class="flex flex-shrink-0 flex-col gap-2">
				{#each statusBadges as statusBadge}
					<span
						class="inline-block rounded-sm border px-2.5 py-1 text-center text-[11px] font-medium tracking-[0.14em] uppercase {statusBadge.className}"
					>
						{statusBadge.label}
					</span>
				{/each}
			</div>
		{/if}
	</div>
</a>
