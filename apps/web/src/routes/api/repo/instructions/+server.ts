// SERVER_JUSTIFICATION: privileged_mutation
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import { applyInstructionExecutionPlan } from '$lib/features/instructions/execution';
import { planInstructionExecution } from '$lib/features/instructions/planner';
import type {
	InstructionExecutionPlan,
	InstructionInputValues
} from '$lib/features/instructions/types';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { withBatchedRepositoryWrites } from '$lib/repository/batch';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';
import { invalidateRepositoryData } from '$lib/server/repository-data';
import { invalidateNavigationManifestStateCache } from '$lib/features/content-management/navigation-manifest';
import {
	createGitHubRepositoryBackend,
	invalidateGitHubRepositoryMetadataCache
} from '$lib/repository/github';
import { invalidateCache } from '$lib/stores/config-cache';

interface ApplyInstructionRequest {
	instructionId: string;
	inputValues: InstructionInputValues;
	plan: InstructionExecutionPlan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isInstructionInputValues(value: unknown): value is InstructionInputValues {
	if (!isRecord(value)) {
		return false;
	}

	return Object.values(value).every(
		(entry) => typeof entry === 'string' || typeof entry === 'boolean'
	);
}

function assertApplyInstructionRequest(value: unknown): ApplyInstructionRequest {
	if (!isRecord(value)) {
		throw error(400, 'Invalid instructions request');
	}

	if (typeof value.instructionId !== 'string' || value.instructionId.length === 0) {
		throw error(400, 'instructionId is required');
	}

	if (!isInstructionInputValues(value.inputValues)) {
		throw error(400, 'inputValues must be an object of strings and booleans');
	}

	if (!isRecord(value.plan)) {
		throw error(400, 'plan is required');
	}

	return value as unknown as ApplyInstructionRequest;
}

function ensureGitHubRepositoryContext(
	locals: App.Locals,
	cookies: Pick<import('@sveltejs/kit').Cookies, 'delete'>
) {
	if (!locals.isAuthenticated || !locals.githubToken) {
		throw error(401, 'Not authenticated');
	}

	if (!locals.selectedRepo) {
		throw error(400, 'No repository selected');
	}

	const octokit = createGitHubServerClient(locals.githubToken, cookies);
	return {
		backend: createGitHubRepositoryBackend(octokit, locals.selectedRepo),
		octokit,
		repo: locals.selectedRepo
	};
}

function plansMatch(left: InstructionExecutionPlan, right: InstructionExecutionPlan) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function instructionErrorResponse(value: unknown, fallbackMessage: string) {
	if (value && typeof value === 'object' && 'status' in value) {
		const status = typeof value.status === 'number' ? value.status : 500;
		const message =
			'body' in value && typeof value.body === 'object' && value.body && 'message' in value.body
				? String(value.body.message)
				: value instanceof Error && value.message
					? value.message
					: fallbackMessage;

		return json(
			{
				message
			},
			{ status }
		);
	}

	return null;
}

export const GET: RequestHandler = async ({ locals, cookies }) => {
	try {
		const { backend } = ensureGitHubRepositoryContext(locals, cookies);
		return json(await discoverInstructions(backend));
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		const response = instructionErrorResponse(err, 'Failed to discover repo instructions');
		if (response) {
			return response;
		}

		console.error('Failed to discover repo instructions:', err);
		return json(
			{
				message: 'Failed to discover repo instructions'
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	try {
		const { backend, octokit, repo } = ensureGitHubRepositoryContext(locals, cookies);
		const mutation = assertApplyInstructionRequest(await request.json());
		const discovery = await discoverInstructions(backend);
		const instruction = discovery.instructions.find(
			(candidate) => candidate.definition.id === mutation.instructionId
		);

		if (!instruction) {
			throw error(404, 'Instruction not found');
		}

		const validatedPlan = await planInstructionExecution(
			backend,
			instruction,
			mutation.inputValues
		);

		if (!plansMatch(validatedPlan, mutation.plan)) {
			throw error(
				409,
				'Instruction plan is stale. Review the confirmation screen again before applying.'
			);
		}

		const { branchName } = await ensureDraftBranch(
			octokit,
			repo.owner,
			repo.name,
			repo.default_branch
		);
		const writeOptions = {
			message: `Apply instruction ${validatedPlan.instructionId} via Tentman`,
			ref: branchName
		};
		const result = await withBatchedRepositoryWrites(backend, writeOptions, (batchBackend) =>
			applyInstructionExecutionPlan(batchBackend, validatedPlan, writeOptions)
		);
		await ensureDraftPullRequest(octokit, repo.owner, repo.name, branchName, repo.default_branch);
		invalidateCache(backend.cacheKey);
		invalidateGitHubRepositoryMetadataCache(backend.cacheKey);
		invalidateNavigationManifestStateCache(backend);
		invalidateRepositoryData({
			backend,
			ref: branchName,
			reason: 'repo-instruction'
		});

		return json({
			result,
			plan: validatedPlan,
			branchName
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		const response = instructionErrorResponse(err, 'Failed to apply repo instruction');
		if (response) {
			return response;
		}

		console.error('Failed to apply repo instruction:', err);
		return json(
			{
				message: 'Failed to apply repo instruction'
			},
			{ status: 500 }
		);
	}
};
