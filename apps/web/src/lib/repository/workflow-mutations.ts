import type { WorkflowDataMode } from './workflow-data';

export type WorkflowMutationIntent =
	| {
			type: 'save-content';
			slug: string;
			target: 'singleton' | 'collection-item';
			itemId?: string | null;
	  }
	| {
			type: 'create-item';
			slug: string;
			itemId?: string | null;
	  }
	| {
			type: 'delete-item';
			slug: string;
			itemId: string;
	  }
	| {
			type: 'save-navigation-manifest';
	  }
	| {
			type: 'save-collection-order';
			slug: string;
	  }
	| {
			type: 'manage-navigation-groups';
			slug: string;
			action: 'create' | 'edit' | 'delete' | 'merge';
	  }
	| {
			type: 'publish-draft';
	  }
	| {
			type: 'discard-draft';
	  };

export type WorkflowMutationOutcome = 'success' | 'degraded' | 'error';

export interface WorkflowMutationRedirect {
	href: string;
	status: 303 | 307 | 308;
	replace: boolean;
}

export interface WorkflowMutationRecoveryCleanup {
	clearEditorRecovery: boolean;
	draftAssetRefs: string[];
}

export interface WorkflowMutationRefreshInstructions {
	workspace: boolean;
	remountWorkspace: boolean;
	navigationManifest: boolean;
	configStates: boolean;
	collections: string[];
	cachePaths: string[];
}

export interface WorkflowMutationResult {
	intent: WorkflowMutationIntent;
	mode: WorkflowDataMode;
	outcome: WorkflowMutationOutcome;
	message: string | null;
	changedPaths: string[];
	redirect: WorkflowMutationRedirect | null;
	recoveryCleanup: WorkflowMutationRecoveryCleanup;
	refresh: WorkflowMutationRefreshInstructions;
	error: string | null;
	degradedReason: string | null;
}

export function createWorkflowMutationResult(input: {
	intent: WorkflowMutationIntent;
	mode: WorkflowDataMode;
	outcome?: WorkflowMutationOutcome;
	message?: string | null;
	changedPaths?: string[] | null;
	redirect?: Partial<WorkflowMutationRedirect> & { href: string };
	recoveryCleanup?: Partial<WorkflowMutationRecoveryCleanup> | null;
	refresh?: Partial<WorkflowMutationRefreshInstructions> | null;
	error?: string | null;
	degradedReason?: string | null;
}): WorkflowMutationResult {
	const outcome = input.outcome ?? 'success';

	return {
		intent: input.intent,
		mode: input.mode,
		outcome,
		message: input.message ?? null,
		changedPaths: input.changedPaths ?? [],
		redirect: input.redirect
			? {
					href: input.redirect.href,
					status: input.redirect.status ?? 303,
					replace: input.redirect.replace ?? false
				}
			: null,
		recoveryCleanup: {
			clearEditorRecovery: input.recoveryCleanup?.clearEditorRecovery ?? false,
			draftAssetRefs: input.recoveryCleanup?.draftAssetRefs ?? []
		},
		refresh: {
			workspace: input.refresh?.workspace ?? false,
			remountWorkspace: input.refresh?.remountWorkspace ?? false,
			navigationManifest: input.refresh?.navigationManifest ?? false,
			configStates: input.refresh?.configStates ?? false,
			collections: input.refresh?.collections ?? [],
			cachePaths: input.refresh?.cachePaths ?? []
		},
		error: outcome === 'error' ? (input.error ?? null) : null,
		degradedReason: outcome === 'degraded' ? (input.degradedReason ?? null) : null
	};
}
