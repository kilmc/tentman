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

	const initialInstruction = initialDiscoveryResult?.instructions[0] ?? null;

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
	const applySuccessLabel = $derived.by(() => {
		if (isLocalMode) {
			return 'locally';
		}

		if (isGitHubMode) {
			return 'to GitHub';
		}

		return '';
	});

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

	const selectedInstruction = $derived(
		discovery.instructions.find(
			(instruction) => instruction.definition.id === selectedInstructionId
		) ?? null
	);
	const selectedInstructionTemplateCount = $derived(selectedInstruction?.templates.length ?? 0);

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
				throw new Error('The local repository backend is no longer available.');
			}

			const planInstructionExecution =
				services.planInstructionExecution ??
				(await loadInstructionPlannerModule()).planInstructionExecution;
			return await planInstructionExecution(backend, instruction, values);
		}

		if (!isGitHubMode) {
			throw new Error('Instructions are not available for the selected repository backend.');
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
			throw new Error(
				await readResponseError(response, 'Failed to build the GitHub-backed instruction plan')
			);
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
						error: 'Open a local repository to use instructions in local mode.'
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
					throw new Error(
						await readResponseError(response, 'Failed to discover GitHub-backed instructions')
					);
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

			const nextInstruction =
				result.instructions.find(
					(instruction: DiscoveredInstruction) =>
						instruction.definition.id === selectedInstructionId
				) ??
				result.instructions[0] ??
				null;
			if (
				options.preservePlanState &&
				nextInstruction &&
				nextInstruction.definition.id === selectedInstructionId
			) {
				selectedInstructionId = nextInstruction.definition.id;
			} else {
				resetForInstruction(nextInstruction);
			}
		} catch (error) {
			discovery = {
				status: 'error',
				instructions: [],
				issues: [],
				error: error instanceof Error ? error.message : 'Failed to discover instructions'
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
			planError = error instanceof Error ? error.message : 'Failed to build instruction plan';
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
			applyError = `${message} Tentman refreshed the confirmation screen with the latest repo state.`;
		} catch (error) {
			applyError = error instanceof Error ? error.message : message;
		}
	}

	async function handleApplyPlan() {
		if (!activePlan) {
			return;
		}

		if (!selectedInstruction) {
			applyError = 'The selected instruction is no longer available. Refresh and review the inputs again.';
			return;
		}

		applying = true;
		applyError = null;

		try {
			if (isLocalMode) {
				const backend = get(localRepo).backend;
				if (!backend) {
					applyError = 'The local repository backend is no longer available.';
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
						'The repo changed while you were reviewing this instruction. Tentman refreshed the confirmation screen with the latest repo state.';
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
							'The repo changed since this plan was built. Review the confirmation screen again.'
						)
					);
					return;
				}

				if (!response.ok) {
					throw new Error(
						await readResponseError(response, 'Failed to apply the instruction in GitHub mode')
					);
				}

				const payload = await response.json();
				applyResult = payload.result;
				activePlan = payload.plan;
			}

			await invalidateAll();
			await refreshInstructions({ preservePlanState: true });
		} catch (error) {
			applyError = error instanceof Error ? error.message : 'Failed to apply instruction';
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
	<section class="rounded-[1.5rem] border border-stone-200 bg-white p-6 sm:p-8">
		<p class="text-xs font-semibold tracking-[0.24em] text-stone-500 uppercase">Instructions</p>
		<h1 class="mt-3 text-4xl font-black tracking-[-0.05em] text-stone-950 sm:text-5xl">
			Scaffold repo changes with a friendlier confirmation step
		</h1>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-600">
			Tentman discovers repo-authored instructions, validates inputs, assembles the confirmation
			screen in the browser, and only uses the server when GitHub-backed reads or writes need
			authenticated access.
		</p>
	</section>

	{#if !isLocalMode && !isGitHubMode}
		<section class="rounded-xl border border-stone-200 bg-white p-6">
			<h2 class="text-xl font-semibold text-stone-950">Choose a repository first</h2>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
				Instructions work against the currently selected repository. Open a local repo or choose a
				GitHub repo first.
			</p>
		</section>
	{:else if discovery.status === 'loading' || discovery.status === 'idle'}
		<section class="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
			Scanning
			<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">tentman/instructions</code>
			for repo-authored instructions...
		</section>
	{:else if discovery.error}
		<section class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
			{discovery.error}
		</section>
	{:else if discovery.instructions.length === 0}
		<section class="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6">
			<h2 class="text-xl font-semibold text-stone-950">No instructions found yet</h2>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
				Add an
				<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">instruction.json</code>
				file under
				<code class="rounded bg-stone-100 px-1 py-0.5 text-xs"
					>tentman/instructions/&lt;instruction-id&gt;</code
				>
				and place one or more
				<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">*.tmpl</code>
				files inside a
				<code class="rounded bg-stone-100 px-1 py-0.5 text-xs">templates/</code>
				folder.
			</p>

			{#if discovery.issues.length > 0}
				<div class="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
					<p class="text-sm font-semibold text-yellow-950">Authoring issues</p>
					<div class="mt-3 space-y-2">
						{#each discovery.issues as issue (issue.path)}
							<p class="text-sm leading-6 text-yellow-900">
								<span class="font-medium">{issue.path}:</span>
								{issue.message}
							</p>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
			<section class="rounded-xl border border-stone-200 bg-white p-4">
				<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">Available</p>
				<div class="mt-4 space-y-2">
					{#each discovery.instructions as instruction (instruction.definition.id)}
						<button
							type="button"
							class={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
								instruction.definition.id === selectedInstructionId
									? 'border-stone-950 bg-stone-950 text-white'
									: 'border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-300 hover:bg-white'
							}`}
							onclick={() => applyInstructionSelection(instruction.definition.id)}
						>
							<p class="text-sm font-semibold">{instruction.definition.label}</p>
							<p
								class={`mt-1 text-sm leading-6 ${
									instruction.definition.id === selectedInstructionId
										? 'text-stone-300'
										: 'text-stone-600'
								}`}
							>
								{instruction.definition.description}
							</p>
						</button>
					{/each}
				</div>

				{#if discovery.issues.length > 0}
					<div class="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
						<p class="text-sm font-semibold text-yellow-950">Authoring issues</p>
						<div class="mt-3 space-y-2">
							{#each discovery.issues as issue (issue.path)}
								<p class="text-sm leading-6 text-yellow-900">
									<span class="font-medium">{issue.path}:</span>
									{issue.message}
								</p>
							{/each}
						</div>
					</div>
				{/if}
			</section>

			{#if selectedInstruction}
				<section class="rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
					{#if applyResult && activePlan}
						<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">Success</p>
						<h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950">
							{activePlan.instructionLabel} applied {applySuccessLabel}
						</h2>
						<p class="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
							Tentman wrote the validated plan through the active repository backend and kept the
							confirmation-first flow intact.
						</p>

						<div class="mt-6 grid gap-3 sm:grid-cols-3">
							<div class="rounded-xl border border-stone-200 bg-stone-50 p-4">
								<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
									Created
								</p>
								<p class="mt-2 text-2xl font-bold text-stone-950">
									{applyResult.createdFiles.length}
								</p>
							</div>
							<div class="rounded-xl border border-stone-200 bg-stone-50 p-4">
								<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
									Skipped
								</p>
								<p class="mt-2 text-2xl font-bold text-stone-950">
									{applyResult.skippedFiles.length}
								</p>
							</div>
							<div class="rounded-xl border border-stone-200 bg-stone-50 p-4">
								<p class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">
									Navigation
								</p>
								<p class="mt-2 text-sm font-semibold text-stone-950">
									{applyResult.navigationUpdated ? 'Updated' : 'No change needed'}
								</p>
							</div>
						</div>

						{#if activePlan.notes.length > 0}
							<div class="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
								<p class="text-sm font-semibold text-stone-950">Next</p>
								<div class="mt-3 space-y-2">
									{#each activePlan.notes as note}
										<p class="text-sm text-stone-700">{note}</p>
									{/each}
								</div>
							</div>
						{/if}

						<details class="mt-6 rounded-xl border border-stone-200 bg-white p-4">
							<summary class="cursor-pointer text-sm font-semibold text-stone-900">
								Applied details
							</summary>
							<div class="mt-4 space-y-2 text-sm text-stone-700">
								{#each applyResult.createdFiles as path, index (`${path}:${index}`)}
									<p class="font-mono text-xs text-stone-900">{path}</p>
								{/each}
								{#each applyResult.skippedFiles as path, index (`${path}:${index}`)}
									<p class="font-mono text-xs text-stone-500">{path} (skipped)</p>
								{/each}
							</div>
						</details>

						<div class="mt-6 flex flex-wrap gap-3">
							<button
								type="button"
								class="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
								onclick={() => {
									applyResult = null;
									activePlan = null;
								}}
							>
								Run another instruction
							</button>
						</div>
					{:else if activePlan}
						<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">
							Confirmation
						</p>
						<h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950">
							{activePlan.confirmationTitle}
						</h2>
						<div class="mt-5 space-y-3">
							{#each activePlan.confirmationSummary as line}
								<div
									class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700"
								>
									{line}
								</div>
							{/each}
						</div>

						{#if activePlan.inputErrors.length > 0}
							<div class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
								<p class="text-sm font-semibold text-red-900">Fix these inputs first</p>
								<div class="mt-3 space-y-2">
									{#each activePlan.inputErrors as issue}
										<p class="text-sm text-red-800">{issue.message}</p>
									{/each}
								</div>
							</div>
						{/if}

						{#if activePlan.planErrors.length > 0}
							<div class="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
								<p class="text-sm font-semibold text-yellow-950">Things to resolve before apply</p>
								<div class="mt-3 space-y-2">
									{#each activePlan.planErrors as issue}
										<p class="text-sm text-yellow-900">{issue}</p>
									{/each}
								</div>
							</div>
						{/if}

						{#if activePlan.notes.length > 0}
							<div class="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
								<p class="text-sm font-semibold text-stone-950">Afterward</p>
								<div class="mt-3 space-y-2">
									{#each activePlan.notes as note}
										<p class="text-sm text-stone-700">{note}</p>
									{/each}
								</div>
							</div>
						{/if}

						<details class="mt-6 rounded-xl border border-stone-200 bg-white p-4">
							<summary class="cursor-pointer text-sm font-semibold text-stone-900">
								Advanced details
							</summary>

							<div class="mt-4 space-y-4 text-sm text-stone-700">
								<div>
									<p class="font-medium text-stone-950">Files</p>
									<div class="mt-2 space-y-2">
										{#each activePlan.files as file, index (`${file.path}:${file.sourceTemplatePath}:${index}`)}
											<div class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
												<p class="font-mono text-xs text-stone-900">{file.path}</p>
												<p class="mt-1 text-xs tracking-[0.18em] text-stone-500 uppercase">
													{file.status}
												</p>
												{#if file.reason}
													<p class="mt-1 text-sm text-stone-600">{file.reason}</p>
												{/if}
											</div>
										{/each}
									</div>
								</div>

								{#if activePlan.navigationChange}
									<div>
										<p class="font-medium text-stone-950">Navigation</p>
										<div class="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
											<p class="font-mono text-xs text-stone-900">
												{activePlan.navigationChange.path}
											</p>
											<p class="mt-1 text-sm text-stone-700">
												{activePlan.navigationChange.summary}
											</p>
										</div>
									</div>
								{/if}
							</div>
						</details>

						<div class="mt-6 flex flex-wrap gap-3">
							<button
								type="button"
								class="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
								onclick={() => {
									activePlan = null;
									planError = null;
								}}
							>
								Back to inputs
							</button>
							<button
								type="button"
								class="inline-flex min-h-11 items-center justify-center rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
								onclick={() => void handleApplyPlan()}
								disabled={applying ||
									activePlan.inputErrors.length > 0 ||
									activePlan.planErrors.length > 0}
							>
								{applying ? 'Applying…' : isLocalMode ? 'Apply locally' : 'Apply to GitHub'}
							</button>
						</div>

						{#if applyError}
							<div class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
								{applyError}
							</div>
						{/if}
					{:else}
						<p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">Inputs</p>
						<h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950">
							{selectedInstruction.definition.label}
						</h2>
						<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
							{selectedInstruction.definition.description}
						</p>

						{#if selectedInstructionTemplateCount === 0}
							<div class="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
								<p class="text-sm font-semibold text-yellow-950">No templates found</p>
								<p class="mt-2 text-sm leading-6 text-yellow-900">
									This instruction parsed correctly, but Tentman did not discover any
									<code class="rounded bg-yellow-100 px-1 py-0.5 text-xs">templates/**/*.tmpl</code>
									files yet. You can still review the instruction inputs, but the plan will not create
									any files until templates are added.
								</p>
							</div>
						{/if}

						{#if discovery.issues.length > 0}
							<div class="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
								<p class="text-sm font-semibold text-stone-950">Instruction authoring notes</p>
								<p class="mt-2 text-sm leading-6 text-stone-600">
									Tentman skipped
									{discovery.issues.length}
									{discovery.issues.length === 1 ? 'instruction issue' : 'instruction issues'}
									while scanning this repo. You can still use the valid instructions listed here.
								</p>
							</div>
						{/if}

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
												{inputValues[input.id] ? 'Enabled' : 'Disabled'}
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
								{planning ? 'Building preview…' : 'Review changes'}
							</button>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</div>
