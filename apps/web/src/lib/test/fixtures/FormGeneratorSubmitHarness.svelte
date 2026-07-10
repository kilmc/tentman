<script lang="ts">
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { ParsedContentConfig } from '$lib/config/parse';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import type { FormDirtyState } from '$lib/features/forms/edit-session';

	interface Props {
		config: ParsedContentConfig;
		initialData?: ContentRecord;
		existingItems?: ContentRecord[];
		blockRegistry?: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		groupManagementCollections?: string[];
		width?: number;
		onaddselectoption?: (input: {
			collection: string;
			id: string;
			value: string;
			label: string;
		}) => Promise<void>;
	}

	let {
		config,
		initialData = {},
		existingItems = [],
		blockRegistry,
		navigationManifest,
		groupManagementCollections = [],
		width,
		onaddselectoption
	}: Props = $props();

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

<div style={width ? `width: ${width}px;` : undefined}>
	<FormGenerator
		bind:this={formGenerator}
		{config}
		{initialData}
		{existingItems}
		{blockRegistry}
		{navigationManifest}
		{groupManagementCollections}
		{onaddselectoption}
		ondirtystatechange={handleDirtyStateChange}
	/>
</div>

<button type="button" onclick={prepareSubmit}>Prepare submit</button>
<p data-testid="form-dirty-state">{dirtyLabel}</p>
<p data-testid="submit-error">{submitError}</p>
<pre data-testid="prepared-data">{preparedData}</pre>
