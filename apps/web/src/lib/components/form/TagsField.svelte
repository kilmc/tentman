<script lang="ts">
	import X from 'lucide-svelte/icons/x';
	import {
		addTagsToList,
		filterTagSuggestions,
		getTagValidationMessage,
		isValidTagValue,
		normalizeTagInput,
		normalizeTagList,
		removeTagFromList,
		splitTagInput
	} from '$lib/features/forms/tags';

	interface Props {
		label: string;
		value: unknown;
		suggestions?: string[];
		required?: boolean;
		onchange?: () => void;
	}

	let {
		label,
		value = $bindable([]),
		suggestions = [],
		required = false,
		onchange
	}: Props = $props();

	const inputId = `tags-field-${Math.random().toString(36).substring(2, 9)}`;
	const listboxId = `${inputId}-suggestions`;

	let inputValue = $state('');
	let inputElement = $state<HTMLInputElement | null>(null);
	let isFocused = $state(false);
	let highlightedIndex = $state(0);
	let localError = $state('');

	const tags = $derived(normalizeTagList(value));
	const normalizedInput = $derived(normalizeTagInput(inputValue));
	const filteredSuggestions = $derived(
		filterTagSuggestions({
			query: inputValue,
			suggestions,
			selectedTags: tags
		})
	);
	const canCreateInput = $derived(
		normalizedInput.length > 0 &&
			isValidTagValue(normalizedInput) &&
			!tags.includes(normalizedInput) &&
			!filteredSuggestions.includes(normalizedInput)
	);
	const options = $derived([
		...filteredSuggestions.map((tag) => ({ kind: 'suggestion' as const, tag })),
		...(canCreateInput ? [{ kind: 'create' as const, tag: normalizedInput }] : [])
	]);
	const shouldShowOptions = $derived(isFocused && options.length > 0);
	const activeOptionId = $derived(
		shouldShowOptions ? `${listboxId}-${Math.min(highlightedIndex, options.length - 1)}` : undefined
	);
	const inputValidationMessage = $derived(getTagValidationMessage(normalizedInput));

	$effect(() => {
		if (highlightedIndex >= options.length) {
			highlightedIndex = Math.max(0, options.length - 1);
		}
	});

	function updateTags(nextTags: string[]) {
		value = nextTags;
		onchange?.();
	}

	function clearInput() {
		inputValue = '';
		highlightedIndex = 0;
		localError = '';
	}

	function addCandidates(candidates: string[]) {
		const invalidTag = candidates.find((tag) => !isValidTagValue(tag));
		if (invalidTag) {
			localError = getTagValidationMessage(invalidTag) ?? '';
			return;
		}

		updateTags(addTagsToList(tags, candidates));
		clearInput();
	}

	function commitInput() {
		const candidates = inputValue.includes(',')
			? splitTagInput(inputValue)
			: [normalizeTagInput(inputValue)].filter(Boolean);
		if (candidates.length === 0) {
			return;
		}

		addCandidates(candidates);
	}

	function selectOption(index: number) {
		const option = options[index];
		if (!option) {
			commitInput();
			return;
		}

		addCandidates([option.tag]);
		inputElement?.focus();
	}

	function removeTag(tag: string) {
		updateTags(removeTagFromList(tags, tag));
		inputElement?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Backspace' && inputValue.length === 0 && tags.length > 0) {
			event.preventDefault();
			removeTag(tags[tags.length - 1]);
			return;
		}

		if (event.key === 'ArrowDown' && options.length > 0) {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % options.length;
			return;
		}

		if (event.key === 'ArrowUp' && options.length > 0) {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + options.length) % options.length;
			return;
		}

		if (event.key === 'Enter' || event.key === 'Tab') {
			if (inputValue.trim().length === 0) {
				return;
			}
			event.preventDefault();
			selectOption(highlightedIndex);
			return;
		}

		if (event.key === ',') {
			event.preventDefault();
			commitInput();
			return;
		}

		if (event.key === 'Escape') {
			clearInput();
		}
	}

	function handleInput() {
		localError = inputValidationMessage ?? '';
		highlightedIndex = 0;
	}

	function handlePaste(event: ClipboardEvent) {
		const pastedText = event.clipboardData?.getData('text') ?? '';
		if (!/[\s,]/.test(pastedText)) {
			return;
		}

		event.preventDefault();
		addCandidates(splitTagInput(pastedText));
	}
</script>

<div class="mb-4">
	<div class="mb-1 flex items-center justify-between gap-3">
		<label for={inputId} class="block text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</label>
	</div>

	<div class="relative">
		<div
			class="flex min-h-[2.625rem] w-full flex-wrap items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus-within:border-stone-900 focus-within:ring-1 focus-within:ring-stone-900"
		>
			{#each tags as tag (tag)}
				<span
					class="inline-flex max-w-full items-center gap-1 rounded-sm bg-stone-100 px-2 py-1 font-mono text-xs text-stone-900"
				>
					<span class="truncate">{tag}</span>
					<button
						type="button"
						class="rounded-sm p-0.5 text-stone-500 hover:bg-stone-200 hover:text-stone-950 focus:ring-1 focus:ring-stone-900 focus:outline-none"
						aria-label={`Remove ${tag}`}
						onclick={(event) => {
							event.stopPropagation();
							removeTag(tag);
						}}
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}
			<input
				bind:this={inputElement}
				id={inputId}
				type="text"
				bind:value={inputValue}
				placeholder={tags.length === 0 ? 'Add tag' : ''}
				role="combobox"
				aria-autocomplete="list"
				aria-controls={listboxId}
				aria-expanded={shouldShowOptions}
				aria-activedescendant={activeOptionId}
				aria-required={required}
				onfocus={() => {
					isFocused = true;
				}}
				onblur={() => {
					window.setTimeout(() => {
						isFocused = false;
					}, 120);
				}}
				oninput={handleInput}
				onkeydown={handleKeydown}
				onpaste={handlePaste}
				class="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 font-mono text-sm outline-none placeholder:font-sans placeholder:text-stone-400"
			/>
		</div>

		{#if shouldShowOptions}
			<div
				id={listboxId}
				role="listbox"
				class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg"
			>
				{#each options as option, index (`${option.kind}-${option.tag}`)}
					<button
						id={`${listboxId}-${index}`}
						type="button"
						role="option"
						aria-selected={highlightedIndex === index}
						class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono hover:bg-stone-100"
						class:bg-stone-100={highlightedIndex === index}
						onmouseenter={() => {
							highlightedIndex = index;
						}}
						onmousedown={(event) => {
							event.preventDefault();
							selectOption(index);
						}}
					>
						<span>{option.tag}</span>
						{#if option.kind === 'create'}
							<span class="font-sans text-xs text-stone-500">Create</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if localError}
		<p class="mt-1.5 text-sm font-medium text-red-700">{localError}</p>
	{/if}
</div>
