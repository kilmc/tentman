<script lang="ts">
	interface Props {
		textareaId: string;
		label: string;
		required: boolean;
		maxLength?: number;
		characterCount: number;
		isOverLimit: boolean;
		activeTab: 'rich' | 'markdown';
		ontabchange: (tab: 'rich' | 'markdown') => void;
	}

	let {
		textareaId,
		label,
		required,
		maxLength = undefined,
		characterCount,
		isOverLimit,
		activeTab,
		ontabchange
	}: Props = $props();
</script>

<div class="grid gap-1 bg-white">
	<div class="flex items-center justify-between">
		<label for={textareaId} class="text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</label>
		{#if maxLength !== undefined}
			<span class="text-xs" class:text-red-600={isOverLimit} class:text-gray-500={!isOverLimit}>
				{characterCount}/{maxLength}
			</span>
		{/if}
	</div>

	<div class="flex border-b border-gray-300">
		<button
			type="button"
			onclick={() => ontabchange('rich')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'rich'
				? 'border-stone-950 text-stone-950'
				: 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Rich
		</button>
		<button
			type="button"
			onclick={() => ontabchange('markdown')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'markdown'
				? 'border-stone-950 text-stone-950'
				: 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Markdown
		</button>
	</div>
</div>
