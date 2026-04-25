<script lang="ts">
	import type { BlockUsage } from '$lib/config/types';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import type { FormSidePanelState } from '$lib/features/forms/side-panel';
	import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
	import FormField from './FormField.svelte';

	interface Props {
		panel: FormSidePanelState;
		block: BlockUsage;
		item: ContentRecord;
		onfieldchange?: (blockId: string, value: ContentValue | undefined) => void;
	}

	let { panel, block, item, onfieldchange }: Props = $props();
	let value = $state(getInitialValue());

	$effect(() => {
		value = getInitialValue();
	});

	function getInitialValue() {
		const existingValue = item[block.id];
		if (existingValue !== undefined) {
			return existingValue;
		}

		return buildBlockFormData([block], {}, panel.blockRegistry)[block.id];
	}

	function handleChange() {
		onfieldchange?.(block.id, value);
	}
</script>

<FormField
	{block}
	fieldPath={panel.fieldPath ? `${panel.fieldPath}[${panel.selectedIndex}].${block.id}` : block.id}
	bind:value
	imagePath={panel.imagePath}
	blockRegistry={panel.blockRegistry}
	navigationManifest={panel.navigationManifest}
	onaddselectoption={panel.onaddselectoption}
	onchange={handleChange}
/>
