import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/instructions/discovery', () => ({
	discoverInstructions: vi.fn()
}));

vi.mock('$lib/features/instructions/planner', () => ({
	planInstructionExecution: vi.fn()
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn(() => ({
		cacheKey: 'github:acme/docs'
	}))
}));

vi.mock('$lib/server/auth/github', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth/github')>('$lib/server/auth/github');

	return {
		...actual,
		createGitHubServerClient: vi.fn(() => ({ rest: {} }))
	};
});

import { POST } from './+server';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import { planInstructionExecution } from '$lib/features/instructions/planner';

const repoLocals = {
	isAuthenticated: true,
	githubToken: 'secret-token',
	selectedRepo: {
		owner: 'acme',
		name: 'docs',
		full_name: 'acme/docs'
	}
};

describe('POST /api/repo/instructions/plan', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a validated plan for the selected instruction', async () => {
		vi.mocked(discoverInstructions).mockResolvedValue({
			instructions: [
				{
					path: 'tentman/instructions/create-page',
					definition: {
						id: 'create-page',
						label: 'Create page',
						description: 'Scaffold a page.',
						inputs: []
					},
					templates: []
				}
			],
			issues: []
		});
		vi.mocked(planInstructionExecution).mockResolvedValue({
			instructionId: 'create-page',
			instructionLabel: 'Create page',
			inputValues: { slug: 'press-kit' },
			confirmationTitle: 'Create Press Kit',
			confirmationSummary: ['This will create a new page at /press-kit.'],
			notes: [],
			files: [],
			navigationChange: null,
			inputErrors: [],
			planErrors: []
		} as never);

		const response = await POST({
			locals: repoLocals,
			cookies: { delete: vi.fn() },
			request: new Request('http://localhost/api/repo/instructions/plan', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					instructionId: 'create-page',
					inputValues: {
						slug: 'press-kit'
					}
				})
			})
		} as never);

		expect(await response.json()).toEqual({
			plan: {
				instructionId: 'create-page',
				instructionLabel: 'Create page',
				inputValues: { slug: 'press-kit' },
				confirmationTitle: 'Create Press Kit',
				confirmationSummary: ['This will create a new page at /press-kit.'],
				notes: [],
				files: [],
				navigationChange: null,
				inputErrors: [],
				planErrors: []
			},
			issues: []
		});
	});

	it('returns structured JSON errors for missing instructions', async () => {
		vi.mocked(discoverInstructions).mockResolvedValue({
			instructions: [],
			issues: []
		});

		const response = await POST({
			locals: repoLocals,
			cookies: { delete: vi.fn() },
			request: new Request('http://localhost/api/repo/instructions/plan', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					instructionId: 'missing',
					inputValues: {}
				})
			})
		} as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			message: 'Instruction not found'
		});
	});
});
