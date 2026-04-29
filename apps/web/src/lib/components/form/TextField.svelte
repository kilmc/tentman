<script lang="ts">
	interface Props {
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		minLength?: number;
		maxLength?: number;
		onchange?: () => void;
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		placeholder = '',
		minLength,
		maxLength,
		onchange
	}: Props = $props();

	// Generate unique ID for accessibility
	const inputId = `text-field-${Math.random().toString(36).substring(2, 9)}`;

	// Character count state
	let characterCount = $derived(value.length);
	let isOverLimit = $derived(maxLength !== undefined && characterCount > maxLength);
	let isUnderMin = $derived(
		minLength !== undefined && characterCount > 0 && characterCount < minLength
	);
</script>

<div class="mb-4">
	<div class="mb-1 flex items-center justify-between">
		<label for={inputId} class="text-sm font-medium text-gray-700">
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
	<input
		id={inputId}
		type="text"
		bind:value
		{placeholder}
		{required}
		minlength={minLength}
		maxlength={maxLength}
		oninput={() => onchange?.()}
		class="w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-1 focus:outline-none"
		class:border-red-300={isOverLimit || isUnderMin}
		class:focus:border-red-500={isOverLimit || isUnderMin}
		class:focus:ring-red-500={isOverLimit || isUnderMin}
		class:border-gray-300={!isOverLimit && !isUnderMin}
		class:focus:border-stone-900={!isOverLimit && !isUnderMin}
		class:focus:ring-stone-900={!isOverLimit && !isUnderMin}
	/>
</div>
