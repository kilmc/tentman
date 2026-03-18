<script lang="ts">
	import SvelteMarkdown from '@humanspeak/svelte-markdown';

	interface Props {
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		rows?: number;
		minLength?: number;
		maxLength?: number;
		onchange?: () => void;
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		placeholder = '',
		rows = 12,
		minLength,
		maxLength,
		onchange
	}: Props = $props();

	let activeTab = $state<'edit' | 'preview'>('edit');

	// Character count state
	let characterCount = $derived(value.length);
	let isOverLimit = $derived(maxLength !== undefined && characterCount > maxLength);
	let isUnderMin = $derived(minLength !== undefined && characterCount > 0 && characterCount < minLength);
</script>

<div class="mb-4">
	<div class="mb-1 flex items-center justify-between">
		<label class="text-sm font-medium text-gray-700">
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

	<!-- Tab buttons -->
	<div class="flex border-b border-gray-300 mb-2">
		<button
			type="button"
			onclick={() => activeTab = 'edit'}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'edit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Edit
		</button>
		<button
			type="button"
			onclick={() => activeTab = 'preview'}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'preview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Preview
		</button>
	</div>

	<!-- Edit tab -->
	{#if activeTab === 'edit'}
		<textarea
			bind:value
			{placeholder}
			{required}
			{rows}
			minlength={minLength}
			maxlength={maxLength}
			oninput={() => onchange?.()}
			class="w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1"
			class:border-red-300={isOverLimit || isUnderMin}
			class:focus:border-red-500={isOverLimit || isUnderMin}
			class:focus:ring-red-500={isOverLimit || isUnderMin}
			class:border-gray-300={!isOverLimit && !isUnderMin}
			class:focus:border-blue-500={!isOverLimit && !isUnderMin}
			class:focus:ring-blue-500={!isOverLimit && !isUnderMin}
		></textarea>
		<p class="mt-1 text-xs text-gray-500">Supports Markdown formatting</p>
	{/if}

	<!-- Preview tab -->
	{#if activeTab === 'preview'}
		<div class="w-full min-h-[200px] rounded border border-gray-300 px-3 py-2 bg-gray-50">
			<div class="prose prose-sm max-w-none dark:prose-invert">
				{#if value}
					<SvelteMarkdown source={value} />
				{:else}
					<p class="text-gray-400 italic">Nothing to preview</p>
				{/if}
			</div>
		</div>
		<p class="mt-1 text-xs text-gray-500">Markdown preview</p>
	{/if}
</div>
