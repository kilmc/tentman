<script lang="ts">
	import type { FormSidePanelState } from '$lib/features/forms/side-panel';
	import SidePanelHost from '$lib/components/form/SidePanelHost.svelte';

	interface Props {
		panel: FormSidePanelState;
		width?: number;
	}

	let { panel, width }: Props = $props();
</script>

<div style={width ? `width: ${width}px;` : undefined}>
	<SidePanelHost {panel} />
</div>
