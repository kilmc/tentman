<script lang="ts">
	import type { FieldDefinition } from '$lib/types/config';
	import { getFieldLabel } from '$lib/types/config';
	import { formatContentValue } from '$lib/features/content-management/item';
	import type { ContentRecord } from '$lib/features/content-management/types';

	interface Props {
		item: ContentRecord;
		href: string;
		cardFields: {
			primary: [string, FieldDefinition][];
			secondary: [string, FieldDefinition][];
		};
		badge?: 'draft' | 'new' | 'deleted';
	}

	let { item, href, cardFields, badge }: Props = $props();

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
				return '📝 Draft';
			case 'new':
				return '✨ New';
			case 'deleted':
				return '🗑️ Deleted';
		}
	}
</script>

<a
	{href}
	class="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 hover:border-gray-300 cursor-pointer"
>
	<div class="flex items-start justify-between gap-4">
		<div class="flex-1 min-w-0">
			<!-- Primary fields (titles) -->
			{#if cardFields.primary.length > 0}
				<div class="space-y-1">
					{#each cardFields.primary as [fieldName, fieldDef]}
						<h3 class="text-lg font-semibold text-gray-900 break-words">
							{formatContentValue(item[fieldName])}
						</h3>
					{/each}
				</div>
			{/if}

			<!-- Secondary fields (metadata) -->
			{#if cardFields.secondary.length > 0}
				<div class="mt-2 space-y-1">
					{#each cardFields.secondary as [fieldName, fieldDef]}
						<p class="text-sm text-gray-600">
							<span class="font-medium">{getFieldLabel(fieldName, fieldDef)}:</span>
							{formatContentValue(item[fieldName])}
						</p>
					{/each}
				</div>
			{/if}

			{#if item._filename}
				<p class="mt-3 text-xs text-gray-400 font-mono">{item._filename}</p>
			{/if}
		</div>

		<!-- Badge -->
		{#if badge}
			<div class="flex-shrink-0">
				<span
					class="inline-block rounded-full border px-3 py-1 text-xs font-medium {getBadgeStyles(badge)}"
				>
					{getBadgeLabel(badge)}
				</span>
			</div>
		{/if}
	</div>
</a>
