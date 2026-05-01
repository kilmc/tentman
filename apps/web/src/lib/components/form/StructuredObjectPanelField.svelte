<script lang="ts">
	import { getContext, hasContext } from 'svelte';
	import { writable } from 'svelte/store';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import type { BlockUsage } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import { parseFieldPath, type OpenObjectPanelInput } from '$lib/features/forms/edit-session';
	import {
		FORM_SIDE_PANEL,
		type FormSidePanelContext,
		type FormSidePanelState
	} from '$lib/features/forms/side-panel';
	import type { ContentRecord } from '$lib/features/content-management/types';

	interface Props {
		label: string;
		blocks: BlockUsage[];
		value: ContentRecord;
		fieldPath?: string;
		required?: boolean;
		imagePath?: string;
		blockRegistry: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		onaddselectoption?: (input: {
			collection: string;
			id: string;
			value: string;
			label: string;
		}) => Promise<void>;
	}

	let {
		label,
		blocks,
		value = $bindable({}),
		fieldPath,
		required = false,
		imagePath,
		blockRegistry,
		navigationManifest,
		onaddselectoption
	}: Props = $props();

	const fallbackPanelState = (() => {
		const activePanel = writable<FormSidePanelState | null>(null);
		return {
			activePanel,
			setActivePanel(panel: FormSidePanelState | null) {
				activePanel.set(panel);
			},
			session: null
		} satisfies FormSidePanelContext;
	})();

	const sidePanel = hasContext(FORM_SIDE_PANEL)
		? getContext<FormSidePanelContext>(FORM_SIDE_PANEL)
		: fallbackPanelState;
	const activeSidePanel = sidePanel.activePanel;

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		value = buildBlockFormData(blocks, {}, blockRegistry);
	}

	const panelId = $derived(fieldPath ? `object:${fieldPath}` : `object:${label}`);
	const isPanelOpen = $derived($activeSidePanel?.id === panelId && $activeSidePanel.kind === 'object');

	function createPanel(): OpenObjectPanelInput | null {
		if (!sidePanel.session || !fieldPath) {
			return null;
		}

		return {
			id: panelId,
			kind: 'object' as const,
			mode: 'edit' as const,
			label,
			listLabel: label,
			title: label,
			blocks,
			selectedItem: value as ContentRecord,
			targetPath: parseFieldPath(fieldPath),
			itemFieldPath: fieldPath,
			imagePath,
			blockRegistry,
			navigationManifest,
			onaddselectoption
		};
	}

	function openPanel() {
		const panel = createPanel();
		if (panel) {
			sidePanel.session?.openPanel(panel);
		}
	}
</script>

<fieldset class="mb-4">
	<button
		type="button"
		class="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-stone-200 bg-white px-4 py-3 text-left text-sm text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
		class:border-stone-950={isPanelOpen}
		class:bg-stone-100={isPanelOpen}
		class:text-stone-950={isPanelOpen}
		onclick={openPanel}
		aria-pressed={isPanelOpen}
		aria-label={`Edit ${label}`}
		title={`Edit ${label}`}
		data-form-side-panel-opener="true"
	>
		<span class="grid gap-0.5">
			<span class="font-medium text-current">
				{label}
				{#if required}
					<span class="text-red-600">*</span>
				{/if}
			</span>
			<span class="text-xs text-stone-500">Open editor</span>
		</span>
		<ChevronRight class="h-4 w-4 text-stone-400" />
	</button>
</fieldset>
