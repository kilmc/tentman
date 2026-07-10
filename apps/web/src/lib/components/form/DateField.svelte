<script lang="ts">
	interface Props {
		label: string;
		value: string;
		required?: boolean;
		onchange?: () => void;
	}

	let { label, value = $bindable(''), required = false, onchange }: Props = $props();

	const inputId = `date-field-${Math.random().toString(36).substring(2, 9)}`;

	function toDateInputValue(value: string): string {
		if (!value) {
			return '';
		}

		const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
		if (datePart) {
			return datePart;
		}

		const parsedDate = new Date(value);
		return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
	}

	let inputValue = $state(toDateInputValue(value));

	$effect(() => {
		inputValue = toDateInputValue(value);
	});

	function handleInput(event: Event) {
		inputValue = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		value = inputValue;
		onchange?.();
	}
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
		type="date"
		value={inputValue}
		{required}
		oninput={handleInput}
		class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
	/>
</div>
