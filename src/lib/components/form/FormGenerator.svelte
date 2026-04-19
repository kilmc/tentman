<script lang="ts">
	import { getContext, hasContext, onDestroy, setContext } from 'svelte';
	import { writable } from 'svelte/store';
	import { createBlockRegistry, type BlockRegistry } from '$lib/blocks/registry';
	import type { DiscoveredBlockConfig } from '$lib/config/discovery';
	import type { ParsedContentConfig } from '$lib/config/parse';
	import { buildFormData } from '$lib/features/forms/helpers';
	import {
		FORM_WORKSPACE_PANEL,
		type FormWorkspacePanelContext,
		type RepeatableWorkspacePanel
	} from '$lib/features/forms/workspace-panel';
	import { validateFormData, type ValidationError } from '$lib/utils/validation';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import FormField from './FormField.svelte';
	import RepeatablePanelHost from './RepeatablePanelHost.svelte';

	interface Props {
		config: ParsedContentConfig;
		initialData?: Record<string, any>;
		existingItems?: Record<string, any>[];
		currentItemId?: string;
		realtimeValidation?: boolean; // Enable real-time validation on field change
		blockConfigs?: DiscoveredBlockConfig[];
		blockRegistry?: BlockRegistry;
		// Function to get current form data - called by parent before submit
		onvalidate?: (data: ContentRecord, errors: ValidationError[]) => void;
	}

	let {
		config,
		initialData = {},
		existingItems = [],
		currentItemId,
		realtimeValidation = false,
		blockConfigs = [],
		blockRegistry: providedBlockRegistry = undefined,
		onvalidate
	}: Props = $props();

	function cloneInitialData(value: Record<string, any>): Record<string, any> {
		try {
			return structuredClone(value);
		} catch {
			return JSON.parse(JSON.stringify(value)) as Record<string, any>;
		}
	}

	const blockRegistry = providedBlockRegistry ?? createBlockRegistry(blockConfigs);
	const parentWorkspacePanel = hasContext(FORM_WORKSPACE_PANEL)
		? getContext<FormWorkspacePanelContext>(FORM_WORKSPACE_PANEL)
		: null;
	const activeWorkspacePanel =
		parentWorkspacePanel?.activePanel ?? writable<RepeatableWorkspacePanel | null>(null);
	const ownsWorkspacePanel = parentWorkspacePanel === null;
	const workspacePanel = parentWorkspacePanel ?? {
		activePanel: activeWorkspacePanel,
		setActivePanel(panel: RepeatableWorkspacePanel | null) {
			activeWorkspacePanel.set(panel);
		}
	};

	if (ownsWorkspacePanel) {
		setContext<FormWorkspacePanelContext>(FORM_WORKSPACE_PANEL, workspacePanel);
	}

	// FormGenerator owns its own state - initialize once with structuredClone
	let formData = $state<Record<string, any>>(
		buildFormData(config, cloneInitialData(initialData), blockRegistry)
	);
	let validationErrors = $state<ValidationError[]>([]);
	let showErrors = $state(false);
	let touchedFields = $state<Set<string>>(new Set()); // Track which fields have been interacted with

	// Validate and return errors - can be called by parent
	export function validate(): { data: Record<string, any>; errors: ValidationError[] } {
		const errors = validateFormData(
			config,
			formData,
			{
				existingItems,
				currentItemId
			},
			blockRegistry
		);
		validationErrors = errors;
		showErrors = true;

		// Call onvalidate callback if provided
		onvalidate?.(formData, errors);

		return { data: formData, errors };
	}

	// Get current form data without validation
	export function getData(): Record<string, any> {
		return formData;
	}

	function handleFieldChange(fieldName: string) {
		// Mark field as touched
		touchedFields.add(fieldName);

		if (realtimeValidation) {
			// Run validation on change
			const errors = validateFormData(
				config,
				formData,
				{
					existingItems,
					currentItemId
				},
				blockRegistry
			);
			validationErrors = errors;
			// Only show errors for touched fields in real-time mode
			showErrors = touchedFields.size > 0;
		} else {
			// Clear errors for this field when user makes changes (submit-time validation mode)
			if (showErrors) {
				validationErrors = validationErrors.filter((err) => err.field !== fieldName);
			}
		}
	}

	function getFieldError(fieldName: string): string | undefined {
		// In real-time validation mode, only show errors for touched fields
		if (realtimeValidation && !touchedFields.has(fieldName)) {
			return undefined;
		}
		return validationErrors.find((err) => err.field === fieldName)?.message;
	}

	onDestroy(() => {
		if ($activeWorkspacePanel) {
			workspacePanel.setActivePanel(null);
		}
	});
</script>

<div class="min-w-0 space-y-4">
	<div class="min-w-0 space-y-4">
		{#if showErrors && validationErrors.length > 0}
			{@const visibleErrors = realtimeValidation
				? validationErrors.filter((err) => touchedFields.has(err.field))
				: validationErrors}
			{#if visibleErrors.length > 0}
				<div class="rounded-lg border-2 border-red-300 bg-red-50 p-4 shadow-sm">
					<div class="flex items-start gap-3">
						<svg
							class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
								clip-rule="evenodd"
							/>
						</svg>
						<div class="flex-1">
							<h3 class="mb-2 font-semibold text-red-900">Please fix the following errors:</h3>
							<ul class="space-y-1.5 text-sm text-red-800">
								{#each visibleErrors as error}
									<li class="flex items-start gap-2">
										<span class="mt-0.5 text-red-600">•</span>
										<span>{error.message}</span>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		{#each config.blocks as block}
			<div>
				<FormField
					{block}
					bind:value={formData[block.id]}
					fieldPath={block.id}
					imagePath={config.imagePath}
					{blockRegistry}
					onchange={() => handleFieldChange(block.id)}
				/>
				{#if showErrors && getFieldError(block.id)}
					<div class="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
						<svg class="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
						<span class="font-medium">{getFieldError(block.id)}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if ownsWorkspacePanel && $activeWorkspacePanel}
		<div class="min-h-0 min-w-0">
			<RepeatablePanelHost panel={$activeWorkspacePanel} />
		</div>
	{/if}
</div>
