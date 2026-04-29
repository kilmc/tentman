import { writeNavigationManifest } from '$lib/features/content-management/navigation-manifest';
import type {
	InstructionApplyResult,
	InstructionExecutionPlan,
	PlannedFileCreate
} from '$lib/features/instructions/types';
import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';

function ensurePlanIsApplicable(plan: InstructionExecutionPlan) {
	if (plan.inputErrors.length > 0) {
		throw new Error('Fix the instruction inputs before applying this plan.');
	}

	if (plan.planErrors.length > 0) {
		throw new Error('Resolve the remaining plan issues before applying this instruction.');
	}
}

function isWritableFile(file: PlannedFileCreate) {
	return file.status === 'create';
}

export async function applyInstructionExecutionPlan(
	backend: RepositoryBackend,
	plan: InstructionExecutionPlan,
	options?: RepositoryWriteOptions
): Promise<InstructionApplyResult> {
	ensurePlanIsApplicable(plan);

	const createdFiles: string[] = [];
	const skippedFiles: string[] = [];

	for (const file of plan.files) {
		if (!isWritableFile(file)) {
			skippedFiles.push(file.path);
			continue;
		}

		await backend.writeTextFile(file.path, file.content, options);
		createdFiles.push(file.path);
	}

	let navigationUpdated = false;
	let navigationStatus: InstructionApplyResult['navigationStatus'] = null;

	if (plan.navigationChange) {
		navigationStatus = plan.navigationChange.status;
		if (
			(plan.navigationChange.status === 'create-manifest' ||
				plan.navigationChange.status === 'append-item') &&
			plan.navigationChange.nextManifest
		) {
			await writeNavigationManifest(backend, plan.navigationChange.nextManifest, options);
			navigationUpdated = true;
		}
	}

	return {
		createdFiles,
		skippedFiles,
		navigationUpdated,
		navigationStatus
	};
}
