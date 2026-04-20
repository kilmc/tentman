<script lang="ts">
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { ParsedContentConfig } from '$lib/config/parse';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { FormDirtyState } from '$lib/features/forms/edit-session';

	interface Props {
		config: ParsedContentConfig;
		initialData?: ContentRecord;
		blockRegistry?: BlockRegistry;
	}

	let { config, initialData = {}, blockRegistry }: Props = $props();

	let formGenerator = $state<FormGenerator | null>(null);
	let preparedData = $state('');
	let submitError = $state('');
	let dirtyLabel = $state('clean');

	function handleDirtyStateChange(state: FormDirtyState) {
		dirtyLabel = state.isDirty ? 'dirty' : 'clean';
	}

	function prepareSubmit() {
		const result = formGenerator?.prepareSubmit();
		if (!result) {
			return;
		}

		if (!result.ok || (result.errors?.length ?? 0) > 0) {
			submitError = !result.ok ? result.message : (result.errors?.[0]?.message ?? 'Invalid form');
			preparedData = '';
			return;
		}

		submitError = '';
		preparedData = JSON.stringify(result.data);
	}
</script>

<FormGenerator
	bind:this={formGenerator}
	{config}
	{initialData}
	{blockRegistry}
	ondirtystatechange={handleDirtyStateChange}
/>

<button type="button" onclick={prepareSubmit}>Prepare submit</button>
<p data-testid="form-dirty-state">{dirtyLabel}</p>
<p data-testid="submit-error">{submitError}</p>
<pre data-testid="prepared-data">{preparedData}</pre>
