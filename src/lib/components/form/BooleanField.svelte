<script lang="ts">
	interface Props {
		label: string;
		value: boolean;
		required?: boolean;
		onchange?: (value: boolean) => void;
	}

	let { label, value = $bindable(false), required = false, onchange }: Props = $props();

	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.checked;
		onchange?.(value);
	}
</script>

<div class="mb-4">
	<label class="flex items-center gap-2 text-sm font-medium text-gray-700">
		<input
			type="checkbox"
			checked={value}
			{required}
			onchange={handleChange}
			class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
		/>
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
</div>
