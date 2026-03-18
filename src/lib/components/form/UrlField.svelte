<script lang="ts">
	interface Props {
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		onchange?: () => void;
	}

	let { label, value = $bindable(''), required = false, placeholder = '', onchange }: Props = $props();

	const inputId = `url-field-${Math.random().toString(36).substring(2, 9)}`;
</script>

<div class="mb-4">
	<label for={inputId} class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
	<input
		id={inputId}
		type="url"
		bind:value
		{placeholder}
		{required}
		oninput={() => onchange?.()}
		class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
	/>
</div>
