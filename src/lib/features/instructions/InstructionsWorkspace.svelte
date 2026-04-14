<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { createInstructionInputDefaults, normalizeSlug } from '$lib/features/instructions/input';
	import type {
		DiscoveredInstruction,
		InstructionDiscoveryResult,
		InstructionApplyResult,
		InstructionExecutionPlan,
		InstructionInputValue,
		InstructionInputValues
	} from '$lib/features/instructions/types';
	import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';
	import { localContent } from '$lib/stores/local-content';
	import { localRepo } from '$lib/stores/local-repo';

	type InstructionsPageData = {
		selectedBackend?:
			| {
					kind: 'local';
					repo: {
						name: string;
						pathLabel: string;
					};
			  }
			| {
					kind: 'github';
					repo: {
						full_name: string;
					};
			  }
			| null;
	} & Record<string, unknown>;

	export type InstructionsWorkspaceServices = {
		discoverInstructions?: (backend: RepositoryBackend) => Promise<InstructionDiscoveryResult>;
		planInstructionExecution?: (
			backend: RepositoryBackend,
			instruction: DiscoveredInstruction,
			values: InstructionInputValues
		) => Promise<InstructionExecutionPlan>;
		applyInstructionExecutionPlan?: (
			backend: RepositoryBackend,
			plan: InstructionExecutionPlan,
			options?: RepositoryWriteOptions
		) => Promise<InstructionApplyResult>;
	};

	let {
		data,
		services = {},
		autoLoad = true,
		initialDiscoveryResult = null,
		initialBackendKey = null
	}: {
		data: InstructionsPageData;
		services?: InstructionsWorkspaceServices;
		autoLoad?: boolean;
		initialDiscoveryResult?: InstructionDiscoveryResult | null;
		initialBackendKey?: string | null;
	} = $props();

	const initialInstruction =
		initialDiscoveryResult && initialDiscoveryResult.instructions.length === 1
			? initialDiscoveryResult.instructions[0]
			: null;

	type DiscoveryState = {
		status: 'idle' | 'loading' | 'ready' | 'error';
		instructions: DiscoveredInstruction[];
		issues: { path: string; message: string }[];
		error: string | null;
	};

	type RefreshInstructionsOptions = {
		preservePlanState?: boolean;
	};

	const isLocalMode = $derived(data.selectedBackend?.kind === 'local');
	const isGitHubMode = $derived(data.selectedBackend?.kind === 'github');

	let discovery = $state<DiscoveryState>({
		status: initialDiscoveryResult ? 'ready' : 'idle',
		instructions: initialDiscoveryResult?.instructions ?? [],
		issues: initialDiscoveryResult?.issues ?? [],
		error: null
	});
	let selectedInstructionId = $state<string | null>(initialInstruction?.definition.id ?? null);
	let inputValues = $state<InstructionInputValues>(
		initialInstruction ? createInstructionInputDefaults(initialInstruction) : {}
	);
	let activePlan = $state<InstructionExecutionPlan | null>(null);
	let planning = $state(false);
	let applying = $state(false);
	let planError = $state<string | null>(null);
	let applyError = $state<string | null>(null);
	let applyResult = $state<InstructionApplyResult | null>(null);
	let lastLoadedBackendKey = $state<string | null>(initialBackendKey);

	function getPreferredInstruction(
		instructions: DiscoveredInstruction[],
		instructionId: string | null
	) {
		if (instructionId) {
			const matchingInstruction = instructions.find(
				(instruction) => instruction.definition.id === instructionId
			);
			if (matchingInstruction) {
				return matchingInstruction;
			}
		}

		return instructions.length === 1 ? instructions[0] : null;
	}

	const selectedInstruction = $derived(
		discovery.instructions.find(
			(instruction) => instruction.definition.id === selectedInstructionId
		) ?? null
	);
	const hasMultipleInstructions = $derived(discovery.instructions.length > 1);
	const showingInstructionPicker = $derived(hasMultipleInstructions && !selectedInstruction);
	const confirmButtonLabel = $derived(selectedInstruction?.definition.label ?? 'Confirm');
	const successButtonLabel = $derived(
		hasMultipleInstructions ? 'Add something else' : 'Create another'
	);

	async function loadInstructionDiscoveryModule() {
		return await import('$lib/features/instructions/discovery');
	}

	async function loadInstructionPlannerModule() {
		return await import('$lib/features/instructions/planner');
	}

	async function loadInstructionExecutionModule() {
		return await import('$lib/features/instructions/execution');
	}

	async function readResponseError(response: Response, fallback: string) {
		const contentType = response.headers.get('content-type') ?? '';

		if (contentType.includes('application/json')) {
			try {
				const payload = (await response.json()) as { message?: unknown };
				if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
					return payload.message;
				}
			} catch {
				// Fall back to plain text handling below.
			}
		}

		try {
			const text = (await response.text()).trim();
			return text.length > 0 ? text : fallback;
		} catch {
			return fallback;
		}
	}

	function plansMatch(left: InstructionExecutionPlan, right: InstructionExecutionPlan) {
		return JSON.stringify(left) === JSON.stringify(right);
	}

	function getCompletionTitle(plan: InstructionExecutionPlan) {
		return plan.confirmationTitle.startsWith('Create ')
			? plan.confirmationTitle.replace(/^Create\s+/, 'Created ')
			: 'Done';
	}

	function resetForInstruction(instruction: DiscoveredInstruction | null) {
		selectedInstructionId = instruction?.definition.id ?? null;
		inputValues = instruction ? createInstructionInputDefaults(instruction) : {};
		activePlan = null;
		planError = null;
		applyError = null;
		applyResult = null;
	}

	function applyInstructionSelection(instructionId: string) {
		const instruction =
			discovery.instructions.find((candidate) => candidate.definition.id === instructionId) ?? null;
		resetForInstruction(instruction);
	}

	async function buildInstructionPlan(
		instruction: DiscoveredInstruction,
		values: InstructionInputValues
	) {
		if (isLocalMode) {
			const backend = get(localRepo).backend;
			if (!backend) {
				throw new Error('This action is no longer available.');
			}

			const planInstructionExecution =
				services.planInstructionExecution ??
				(await loadInstructionPlannerModule()).planInstructionExecution;
			return await planInstructionExecution(backend, instruction, values);
		}

		if (!isGitHubMode) {
			throw new Error('This action is not available for the selected repository.');
		}

		const response = await fetch('/api/repo/instructions/plan', {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				instructionId: instruction.definition.id,
				inputValues: values
			})
		});

		if (!response.ok) {
			throw new Error(await readResponseError(response, 'Could not continue with this action.'));
		}

		const payload = await response.json();
		discovery = {
			...discovery,
			issues: payload.issues ?? discovery.issues
		};

		return payload.plan as InstructionExecutionPlan;
	}

	async function refreshInstructions(options: RefreshInstructionsOptions = {}) {
		discovery = {
			status: 'loading',
			instructions: discovery.instructions,
			issues: [],
			error: null
		};

		try {
			let result;

			if (isLocalMode) {
				let repoState = get(localRepo);
				if (!repoState.backend) {
					await localRepo.hydrate();
					repoState = get(localRepo);
				}

				if (!repoState.backend) {
					discovery = {
						status: 'error',
						instructions: [],
						issues: [],
						error: 'Open a repository to add something here.'
					};
					return;
				}

				const discoverInstructions =
					services.discoverInstructions ??
					(await loadInstructionDiscoveryModule()).discoverInstructions;
				result = await discoverInstructions(repoState.backend);
				lastLoadedBackendKey = repoState.backend.cacheKey;
			} else if (isGitHubMode) {
				const response = await fetch('/api/repo/instructions');
				if (!response.ok) {
					throw new Error(await readResponseError(response, 'Could not load the available options.'));
				}

				result = (await response.json()) as InstructionDiscoveryResult;
				lastLoadedBackendKey =
					data.selectedBackend?.kind === 'github' ? data.selectedBackend.repo.full_name : 'github';
			} else {
				return;
			}

			discovery = {
				status: 'ready',
				instructions: result.instructions,
				issues: result.issues,
				error: null
			};

			const nextInstruction = getPreferredInstruction(result.instructions, selectedInstructionId);
			if (
				options.preservePlanState &&
				nextInstruction &&
				nextInstruction.definition.id === selectedInstructionId
			) {
				selectedInstructionId = nextInstruction.definition.id;
			} else if (options.preservePlanState && !nextInstruction && !selectedInstructionId) {
				selectedInstructionId = null;
			} else {
				resetForInstruction(nextInstruction);
			}
		} catch (error) {
			discovery = {
				status: 'error',
				instructions: [],
				issues: [],
				error: error instanceof Error ? error.message : 'Could not load the available options.'
			};
		}
	}

	async function handleReviewChanges() {
		planError = null;
		activePlan = null;
		applyError = null;
		applyResult = null;

		if (!selectedInstruction) {
			return;
		}

		planning = true;

		try {
			activePlan = await buildInstructionPlan(selectedInstruction, inputValues);
		} catch (error) {
			planError = error instanceof Error ? error.message : 'Could not continue with this action.';
		} finally {
			planning = false;
		}
	}

	async function recoverStalePlan(message: string) {
		if (!selectedInstruction || !activePlan) {
			applyError = message;
			return;
		}

		try {
			activePlan = await buildInstructionPlan(selectedInstruction, activePlan.inputValues);
			applyError = `${message} We refreshed it with the latest version so you can confirm again.`;
		} catch (error) {
			applyError = error instanceof Error ? error.message : message;
		}
	}

	async function handleApplyPlan() {
		if (!activePlan) {
			return;
		}

		if (!selectedInstruction) {
			applyError = 'This option is no longer available. Please go back and try again.';
			return;
		}

		applying = true;
		applyError = null;

		try {
			if (isLocalMode) {
				const backend = get(localRepo).backend;
				if (!backend) {
					applyError = 'This action is no longer available.';
					return;
				}

				const planInstructionExecution =
					services.planInstructionExecution ??
					(await loadInstructionPlannerModule()).planInstructionExecution;
				const validatedPlan = await planInstructionExecution(
					backend,
					selectedInstruction,
					activePlan.inputValues
				);

				if (!plansMatch(validatedPlan, activePlan)) {
					activePlan = validatedPlan;
					applyError =
						'Something changed while you were reviewing this, so we refreshed it for you.';
					return;
				}

				const applyInstructionExecutionPlan =
					services.applyInstructionExecutionPlan ??
					(await loadInstructionExecutionModule()).applyInstructionExecutionPlan;
				applyResult = await applyInstructionExecutionPlan(backend, validatedPlan, {
					message: `Apply instruction ${activePlan.instructionId} via Tentman`
				});
				await localContent.refresh({ force: true });
			} else if (isGitHubMode) {
				const response = await fetch('/api/repo/instructions', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						instructionId: activePlan.instructionId,
						inputValues: activePlan.inputValues,
						plan: activePlan
					})
				});

				if (response.status === 409) {
					await recoverStalePlan(
						await readResponseError(
							response,
							'Something changed while you were reviewing this. Please confirm it again.'
						)
					);
					return;
				}

				if (!response.ok) {
					throw new Error(await readResponseError(response, 'Could not finish creating this.'));
				}

				const payload = await response.json();
				applyResult = payload.result;
				activePlan = payload.plan;
			}

			await invalidateAll();
			await refreshInstructions({ preservePlanState: true });
		} catch (error) {
			applyError = error instanceof Error ? error.message : 'Could not finish creating this.';
		} finally {
			applying = false;
		}
	}

	function updateInputValue(inputId: string, value: InstructionInputValue) {
		inputValues = {
			...inputValues,
			[inputId]: value
		};
		activePlan = null;
		planError = null;
		applyError = null;
		applyResult = null;
	}

	onMount(() => {
		if (!autoLoad) {
			return;
		}

		void refreshInstructions();
	});

	$effect(() => {
		if (!autoLoad) {
			return;
		}

		if (!isLocalMode || !$localRepo.backend) {
			return;
		}

		if (discovery.status === 'loading') {
			return;
		}

		if ($localRepo.backend.cacheKey === lastLoadedBackendKey && discovery.status === 'ready') {
			return;
		}

		void refreshInstructions();
	});
</script>

<div class="mx-auto max-w-5xl space-y-6">
	{#if !isLocalMode && !isGitHubMode}
		<section class="rounded-xl border border-stone-200 bg-white p-6">
			<h2 class="text-xl font-semibold text-stone-950">Choose a repository first</h2>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
				Open a repository first so Tentman can show the available creation options.
			</p>
		</section>
	{:else if discovery.status === 'loading' || discovery.status === 'idle'}
		<section class="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
			Loading available options...
		</section>
	{:else if discovery.error}
		<section class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
			This page is not available right now. Try again, and if it keeps happening contact support.
		</section>
	{:else if discovery.instructions.length === 0}
		<section class="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6">
			<h2 class="text-xl font-semibold text-stone-950">Nothing to add yet</h2>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
				There are no creation options available for this site yet.
			</p>
		</section>
	{:else if showingInstructionPicker}
		<section class="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
			<div class="grid gap-4 sm:grid-cols-2">
				{#each discovery.instructions as instruction (instruction.definition.id)}
					<button
						type="button"
						class="group rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5 text-left transition-colors hover:border-stone-900 hover:bg-white"
						onclick={() => applyInstructionSelection(instruction.definition.id)}
					>
						<p class="text-2xl font-bold tracking-[-0.03em] text-stone-950">
							{instruction.definition.label}
						</p>
						<p class="mt-3 text-sm leading-6 text-stone-600">
							{instruction.definition.description}
						</p>
						<p
							class="mt-5 text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase transition-colors group-hover:text-stone-950"
						>
							Continue
						</p>
					</button>
				{/each}
			</div>
		</section>
	{:else if selectedInstruction}
		<section class="rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
			{#if hasMultipleInstructions}
				<button
					type="button"
					class="text-sm font-semibold text-stone-500 transition-colors hover:text-stone-950"
					onclick={() => resetForInstruction(null)}
				>
					All options
				</button>
			{/if}

			{#if applyResult && activePlan}
				<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">Done</p>
				<h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950">
					{getCompletionTitle(activePlan)}
				</h2>
				<p class="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
					Everything was created successfully.
				</p>

				{#if activePlan.notes.length > 0}
					<div class="mt-5 space-y-2 text-sm leading-6 text-stone-600">
						{#each activePlan.notes as note}
							<p>{note}</p>
						{/each}
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap gap-3">
					<button
						type="button"
						class="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
						onclick={() => resetForInstruction(hasMultipleInstructions ? null : selectedInstruction)}
					>
						{successButtonLabel}
					</button>
				</div>
			{:else if activePlan}
				<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">Confirm</p>
				<h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950">
					{activePlan.confirmationTitle}
				</h2>
				<p class="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
					Check the details below, then confirm when you’re ready.
				</p>

				{#if activePlan.inputSummary.length > 0}
					<div class="mt-5 rounded-[1.25rem] border border-stone-200 bg-stone-50 px-5">
						<dl class="divide-y divide-stone-200">
							{#each activePlan.inputSummary as item (`${item.label}:${item.value}`)}
								<div class="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
									<dt class="text-xs font-semibold tracking-[0.16em] text-stone-500 uppercase">
										{item.label}
									</dt>
									<dd class="text-sm leading-6 text-stone-900">{item.value}</dd>
								</div>
							{/each}
						</dl>
					</div>
				{/if}

				{#if activePlan.confirmationSummary.length > 0}
					<div class="mt-5 space-y-2 text-sm leading-6 text-stone-600">
						{#each activePlan.confirmationSummary as line}
							<p>{line}</p>
						{/each}
					</div>
				{/if}

				{#if activePlan.inputErrors.length > 0}
					<div class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
						<p class="text-sm font-semibold text-red-900">Check these details first</p>
						<div class="mt-3 space-y-2">
							{#each activePlan.inputErrors as issue}
								<p class="text-sm text-red-800">{issue.message}</p>
							{/each}
						</div>
					</div>
				{/if}

				{#if activePlan.planErrors.length > 0}
					<div class="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
						<p class="text-sm font-semibold text-yellow-950">This needs attention before you continue</p>
						<div class="mt-3 space-y-2">
							{#each activePlan.planErrors as issue}
								<p class="text-sm text-yellow-900">{issue}</p>
							{/each}
						</div>
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap gap-3">
					<button
						type="button"
						class="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
						onclick={() => {
							activePlan = null;
							planError = null;
						}}
					>
						Back
					</button>
					<button
						type="button"
						class="inline-flex min-h-11 items-center justify-center rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
						onclick={() => void handleApplyPlan()}
						disabled={applying ||
							activePlan.inputErrors.length > 0 ||
							activePlan.planErrors.length > 0}
					>
						{applying ? 'Creating…' : confirmButtonLabel}
					</button>
				</div>

				{#if applyError}
					<div class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
						{applyError}
					</div>
				{/if}
			{:else}
				<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">Details</p>
				<h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950">
					{selectedInstruction.definition.label}
				</h2>

				<div class="mt-6 space-y-5">
					{#each selectedInstruction.definition.inputs as input (input.id)}
						<div>
							<div class="flex items-center gap-2">
								<label class="text-sm font-semibold text-stone-950" for={input.id}>
									{input.label}
								</label>
								{#if input.required}
									<span
										class="text-xs font-semibold tracking-[0.16em] text-stone-400 uppercase"
									>
										Required
									</span>
								{/if}
							</div>
							{#if input.description}
								<p class="mt-1 text-sm text-stone-600">{input.description}</p>
							{/if}

							{#if input.type === 'boolean'}
								<label
									class="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
								>
									<span class="text-sm text-stone-700">
										{inputValues[input.id] ? 'Yes' : 'No'}
									</span>
									<input
										id={input.id}
										type="checkbox"
										class="h-4 w-4 rounded border-stone-300 text-stone-950"
										checked={Boolean(inputValues[input.id])}
										onchange={(event) =>
											updateInputValue(input.id, event.currentTarget.checked)}
									/>
								</label>
							{:else if input.type === 'select'}
								<select
									id={input.id}
									class="mt-3 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900"
									value={String(inputValues[input.id] ?? '')}
									onchange={(event) => updateInputValue(input.id, event.currentTarget.value)}
								>
									{#each input.options ?? [] as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							{:else}
								<input
									id={input.id}
									type="text"
									class="mt-3 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900"
									value={String(inputValues[input.id] ?? '')}
									oninput={(event) =>
										updateInputValue(
											input.id,
											input.type === 'slug'
												? normalizeSlug(event.currentTarget.value)
												: event.currentTarget.value
										)}
								/>
							{/if}
						</div>
					{/each}
				</div>

				{#if planError}
					<div class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
						{planError}
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap gap-3">
					<button
						type="button"
						class="inline-flex min-h-11 items-center justify-center rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
						onclick={() => void handleReviewChanges()}
						disabled={planning}
					>
						{planning ? 'Continuing…' : 'Continue'}
					</button>
				</div>
			{/if}
		</section>
	{/if}
</div>
