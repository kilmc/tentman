<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import type { SelectBlockOption, TentmanGroupBlockOptions } from '$lib/config/types';
	import { deriveNavigationGroupValue } from '$lib/features/content-management/navigation-group-options';
	import { createTentmanId } from '$lib/features/content-management/stable-identity';

	interface Props {
		label: string;
		value: string;
		options?: SelectBlockOption[];
		sourceOptions?: TentmanGroupBlockOptions;
		required?: boolean;
		onchange?: () => void;
		onaddoption?: (input: {
			collection: string;
			id: string;
			value: string;
			label: string;
		}) => Promise<void>;
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

	const ADD_GROUP_VALUE = '__tentman_add_group__';
	const selectId = `select-field-${Math.random().toString(36).substring(2, 9)}`;
	const canAddOption = $derived(sourceOptions?.addOption === true && !!onaddoption);

	let showingAddForm = $state(false);
	let newLabel = $state('');
	let newId = $state('');
	let idWasEdited = $state(false);
	let addError = $state('');
	let adding = $state(false);
	let previousValue = $state(value);
	const canSubmitNewOption = $derived(newLabel.trim().length > 0 && newId.trim().length > 0);

	$effect(() => {
		if (value !== ADD_GROUP_VALUE) {
			previousValue = value;
		}
	});

	function handleNewLabelInput() {
		if (!idWasEdited) {
			newId = deriveNavigationGroupValue(newLabel);
		}
		addError = '';
	}

	function resetAddForm() {
		showingAddForm = false;
		newLabel = '';
		newId = '';
		idWasEdited = false;
		addError = '';
	}

	function openAddForm() {
		showingAddForm = true;
		addError = '';
	}

	function cancelAddForm() {
		value = previousValue;
		onchange?.();
		resetAddForm();
	}

	async function addOption() {
		if (!sourceOptions || !onaddoption) {
			return;
		}

		addError = '';
		adding = true;

		try {
			const id = createTentmanId();
			const optionValue = newId.trim();
			const optionLabel = newLabel.trim();
			await onaddoption({
				collection: sourceOptions.collection,
				id,
				value: optionValue,
				label: optionLabel
			});
			value = id;
			onchange?.();
			resetAddForm();
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
	</div>
	<div class="relative">
		<select
			id={selectId}
			bind:value
			{required}
			onchange={() => {
				if (canAddOption && value === ADD_GROUP_VALUE) {
					openAddForm();
					return;
				}
				onchange?.();
			}}
			class="w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-11 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
		>
			<option value="" disabled={required}>Select {label}</option>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
			{#if canAddOption}
				<option value={ADD_GROUP_VALUE}>Add group...</option>
			{/if}
		</select>
		<div class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-stone-700">
			<ChevronDown class="h-4 w-4" />
		</div>
	</div>
	{#if showingAddForm && sourceOptions}
		<div class="mt-2 rounded-md border border-stone-200 bg-stone-50 p-3">
			<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto_auto]">
				<label class="block">
					<input
						type="text"
						bind:value={newLabel}
						oninput={handleNewLabelInput}
						placeholder="Group title"
						class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
					/>
				</label>
				<label class="block">
					<input
						type="text"
						bind:value={newId}
						oninput={() => {
							idWasEdited = true;
							addError = '';
						}}
						placeholder="group-value"
						class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
					/>
				</label>
				<button
					type="button"
					onclick={cancelAddForm}
					class="tm-btn tm-btn-secondary whitespace-nowrap"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={!canSubmitNewOption || adding}
					onclick={addOption}
					class="tm-btn tm-btn-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
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
