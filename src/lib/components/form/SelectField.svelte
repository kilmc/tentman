<script lang="ts">
	import type { NavigationGroupsSelectBlockOptions, SelectBlockOption } from '$lib/config/types';
	import { slugifyNavigationGroupLabel } from '$lib/features/content-management/navigation-group-options';

	interface Props {
		label: string;
		value: string;
		options?: SelectBlockOption[];
		sourceOptions?: NavigationGroupsSelectBlockOptions;
		required?: boolean;
		onchange?: () => void;
		onaddoption?: (input: { collection: string; id: string; label: string }) => Promise<void>;
	}

	let {
		label,
		value = $bindable(''),
		options = [],
		sourceOptions,
		required = false,
		onchange,
		onaddoption
	}: Props = $props();

	const selectId = `select-field-${Math.random().toString(36).substring(2, 9)}`;
	const canAddOption = $derived(sourceOptions?.addOption === true && !!onaddoption);

	let showingAddForm = $state(false);
	let newLabel = $state('');
	let newId = $state('');
	let idWasEdited = $state(false);
	let addError = $state('');
	let adding = $state(false);

	function handleNewLabelInput() {
		if (!idWasEdited) {
			newId = slugifyNavigationGroupLabel(newLabel);
		}
		addError = '';
	}

	async function addOption() {
		if (!sourceOptions || !onaddoption) {
			return;
		}

		addError = '';
		adding = true;

		try {
			const id = newId.trim();
			const optionLabel = newLabel.trim();
			await onaddoption({
				collection: sourceOptions.collection,
				id,
				label: optionLabel
			});
			value = id;
			onchange?.();
			showingAddForm = false;
			newLabel = '';
			newId = '';
			idWasEdited = false;
		} catch (error) {
			addError = error instanceof Error ? error.message : 'Could not add group';
		} finally {
			adding = false;
		}
	}
</script>

<div class="mb-4">
	<div class="mb-1 flex items-center justify-between gap-3">
		<label for={selectId} class="block text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</label>
		{#if canAddOption}
			<button
				type="button"
				class="text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950"
				onclick={() => {
					showingAddForm = !showingAddForm;
					addError = '';
				}}
			>
				Add group
			</button>
		{/if}
	</div>
	<select
		id={selectId}
		bind:value
		{required}
		onchange={() => onchange?.()}
		class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
	>
		<option value="" disabled={required}>Select {label}</option>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	{#if showingAddForm && sourceOptions}
		<div class="mt-2 rounded-md border border-stone-200 bg-stone-50 p-3">
			<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto]">
				<label class="block">
					<span class="sr-only">Group title</span>
					<input
						type="text"
						bind:value={newLabel}
						oninput={handleNewLabelInput}
						placeholder="Group title"
						class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
					/>
				</label>
				<label class="block">
					<span class="sr-only">Group id</span>
					<input
						type="text"
						bind:value={newId}
						oninput={() => {
							idWasEdited = true;
							addError = '';
						}}
						placeholder="group-id"
						class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
					/>
				</label>
				<button
					type="button"
					disabled={adding}
					onclick={addOption}
					class="tm-btn tm-btn-secondary whitespace-nowrap"
				>
					{adding ? 'Adding...' : 'Add'}
				</button>
			</div>
			{#if addError}
				<p class="mt-2 text-sm font-medium text-red-700">{addError}</p>
			{/if}
		</div>
	{/if}
</div>
