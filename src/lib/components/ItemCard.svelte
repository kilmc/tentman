<script lang="ts">
	import AssetImage from '$lib/components/AssetImage.svelte';
	import type { BlockUsage } from '$lib/config/types';
	import { formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';

	interface Props {
		item: ContentRecord;
		href: string;
		cardFields: {
			primary: BlockUsage[];
			secondary: BlockUsage[];
		};
		badge?: 'draft' | 'new' | 'deleted';
	}

	let { item, href, cardFields, badge }: Props = $props();

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
				return 'bg-blue-100 text-blue-800 border-blue-200';
			case 'new':
				return 'bg-green-100 text-green-800 border-green-200';
			case 'deleted':
				return 'bg-red-100 text-red-800 border-red-200';
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

		if (typeof item.published === 'boolean' && !item.published) {
			badges.push({
				label: 'Unpublished',
				className: 'border-amber-200 bg-amber-50 text-amber-800'
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
	class="block cursor-pointer rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md"
>
	{#if heroImageBlock}
		<div class="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
			<AssetImage
				value={String(item[heroImageBlock.id])}
				alt={heroImageBlock.label ?? 'Content image'}
				assetsDir={heroImageBlock.assetsDir}
				class="h-44 w-full object-cover"
				loading="lazy"
			/>
		</div>
	{/if}

	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<!-- Primary fields (titles) -->
			{#if visiblePrimaryFields.length > 0}
				<div class="space-y-1">
					{#each visiblePrimaryFields as block}
						<h3 class="text-lg font-semibold break-words text-gray-900">
							{formatContentValue(item[block.id])}
						</h3>
					{/each}
				</div>
			{/if}

			<!-- Secondary fields (metadata) -->
			{#if visibleSecondaryFields.length > 0}
				<div class="mt-2 space-y-1">
					{#each visibleSecondaryFields as block}
						{#if block.type === 'image' && typeof item[block.id] === 'string' && item[block.id]}
							<div class="flex items-center gap-3 text-sm text-gray-600">
								<AssetImage
									value={String(item[block.id])}
									alt={getBlockLabel(block)}
									assetsDir={block.assetsDir}
									class="h-12 w-12 rounded-lg border border-gray-200 object-cover"
									loading="lazy"
								/>
								<div class="min-w-0">
									<p class="font-medium text-gray-700">{getBlockLabel(block)}</p>
									<p class="truncate text-xs text-gray-500">{String(item[block.id])}</p>
								</div>
							</div>
						{:else}
							<p class="text-sm text-gray-600">
								<span class="font-medium">{getBlockLabel(block)}:</span>
								{formatContentValue(item[block.id])}
							</p>
						{/if}
					{/each}
				</div>
			{/if}

			{#if item._filename}
				<p class="mt-3 font-mono text-xs text-gray-400">{item._filename}</p>
			{/if}
		</div>

		<!-- Badge -->
		{#if statusBadges.length > 0}
			<div class="flex flex-shrink-0 flex-col gap-2">
				{#each statusBadges as statusBadge}
					<span
						class="inline-block rounded-full border px-3 py-1 text-center text-xs font-medium {statusBadge.className}"
					>
						{statusBadge.label}
					</span>
				{/each}
			</div>
		{/if}
	</div>
</a>
