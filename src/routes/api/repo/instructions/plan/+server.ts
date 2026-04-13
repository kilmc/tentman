// SERVER_JUSTIFICATION: github_proxy
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import { planInstructionExecution } from '$lib/features/instructions/planner';
import type { InstructionInputValues } from '$lib/features/instructions/types';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import { createGitHubServerClient, handleGitHubSessionError } from '$lib/server/auth/github';

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

function assertPlanRequest(value: unknown): {
	instructionId: string;
	inputValues: InstructionInputValues;
} {
	if (!isRecord(value)) {
		throw error(400, 'Invalid instructions plan request');
	}

	if (typeof value.instructionId !== 'string' || value.instructionId.length === 0) {
		throw error(400, 'instructionId is required');
	}

	if (!isInstructionInputValues(value.inputValues)) {
		throw error(400, 'inputValues must be an object of strings and booleans');
	}

	return value as { instructionId: string; inputValues: InstructionInputValues };
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
	return createGitHubRepositoryBackend(octokit, locals.selectedRepo);
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

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	try {
		const backend = ensureGitHubRepositoryContext(locals, cookies);
		const payload = assertPlanRequest(await request.json());
		const discovery = await discoverInstructions(backend);
		const instruction = discovery.instructions.find(
			(candidate) => candidate.definition.id === payload.instructionId
		);

		if (!instruction) {
			throw error(404, 'Instruction not found');
		}

		return json({
			plan: await planInstructionExecution(backend, instruction, payload.inputValues),
			issues: discovery.issues
		});
	} catch (err) {
		handleGitHubSessionError({ cookies }, err);

		const response = instructionErrorResponse(err, 'Failed to build repo instruction plan');
		if (response) {
			return response;
		}

		console.error('Failed to build repo instruction plan:', err);
		return json(
			{
				message: 'Failed to build repo instruction plan'
			},
			{ status: 500 }
		);
	}
};
