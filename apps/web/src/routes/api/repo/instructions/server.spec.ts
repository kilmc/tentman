import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/instructions/discovery', () => ({
	discoverInstructions: vi.fn()
}));

vi.mock('$lib/features/instructions/planner', () => ({
	planInstructionExecution: vi.fn()
}));

vi.mock('$lib/features/instructions/execution', () => ({
	applyInstructionExecutionPlan: vi.fn()
}));

vi.mock('$lib/stores/config-cache', () => ({
	invalidateCache: vi.fn()
}));

vi.mock('$lib/server/repository-data', () => ({
	invalidateRepositoryData: vi.fn()
}));

vi.mock('$lib/repository/github', () => ({
	createGitHubRepositoryBackend: vi.fn(() => ({
		cacheKey: 'github:acme/docs',
		commitChanges: vi.fn(async () => undefined)
	})),
	invalidateGitHubRepositoryMetadataCache: vi.fn()
}));

vi.mock('$lib/server/auth/github', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth/github')>('$lib/server/auth/github');

	return {
		...actual,
		createGitHubServerClient: vi.fn(() => ({ rest: {} }))
	};
});

vi.mock('$lib/features/draft-publishing/service', () => ({
	ensureDraftBranch: vi.fn(async () => ({
		branchName: 'tentman-preview',
		created: false
	}))
}));

vi.mock('$lib/github/pull-request', () => ({
	ensureDraftPullRequest: vi.fn(async () => ({
		number: 42,
		url: 'https://github.com/acme/docs/pull/42',
		title: 'Tentman draft changes'
	}))
}));

import { GET, POST } from './+server';
import { discoverInstructions } from '$lib/features/instructions/discovery';
import { planInstructionExecution } from '$lib/features/instructions/planner';
import { applyInstructionExecutionPlan } from '$lib/features/instructions/execution';
import { ensureDraftBranch } from '$lib/features/draft-publishing/service';
import { ensureDraftPullRequest } from '$lib/github/pull-request';
import { invalidateCache } from '$lib/stores/config-cache';
import { invalidateRepositoryData } from '$lib/server/repository-data';
import {
	createGitHubServerClient,
	GITHUB_REPO_SESSION_COOKIE,
	GITHUB_SESSION_COOKIE,
	GITHUB_TOKEN_COOKIE,
	SELECTED_REPO_COOKIE
} from '$lib/server/auth/github';

function createCookies() {
	return {
		delete: vi.fn()
	};
}

const repoLocals = {
	isAuthenticated: true,
	githubToken: 'secret-token',
	selectedRepo: {
		owner: 'acme',
		name: 'docs',
		full_name: 'acme/docs',
		default_branch: 'trunk'
	}
};

describe('/api/repo/instructions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns discovered instructions for the selected repository', async () => {
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

		const cookies = createCookies();
		const response = await GET({
			locals: repoLocals,
			cookies
		} as never);

		expect(createGitHubServerClient).toHaveBeenCalledWith('secret-token', cookies);
		expect(await response.json()).toEqual({
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
	});

	it('validates and applies a matching client plan', async () => {
		const cookies = createCookies();
		const instruction = {
			path: 'tentman/instructions/create-page',
			definition: {
				id: 'create-page',
				label: 'Create page',
				description: 'Scaffold a page.',
				inputs: []
			},
			templates: []
		};
		const plan = {
			instructionId: 'create-page',
			instructionLabel: 'Create page',
			inputValues: {
				slug: 'press-kit'
			},
			inputSummary: [
				{
					label: 'Slug',
					value: 'press-kit'
				}
			],
			confirmationTitle: 'Create Press Kit',
			confirmationSummary: ['This will create a new page at /press-kit.'],
			notes: [],
			files: [],
			navigationChange: null,
			inputErrors: [],
			planErrors: []
		};

		vi.mocked(discoverInstructions).mockResolvedValue({
			instructions: [instruction],
			issues: []
		});
		vi.mocked(planInstructionExecution).mockResolvedValue(plan as never);
		vi.mocked(applyInstructionExecutionPlan).mockImplementation(async (backend) => {
			await backend.writeTextFile('tentman/configs/press-kit.tentman.json', '{}');
			return {
				createdFiles: ['tentman/configs/press-kit.tentman.json'],
				skippedFiles: [],
				navigationUpdated: false,
				navigationStatus: null
			};
		});

		const response = await POST({
			locals: repoLocals,
			cookies,
			request: new Request('http://localhost/api/repo/instructions', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					instructionId: 'create-page',
					inputValues: {
						slug: 'press-kit'
					},
					plan
				})
			})
		} as never);

		expect(await response.json()).toEqual({
			result: {
				createdFiles: ['tentman/configs/press-kit.tentman.json'],
				skippedFiles: [],
				navigationUpdated: false,
				navigationStatus: null
			},
			plan,
			branchName: 'tentman-preview'
		});
		expect(ensureDraftBranch).toHaveBeenCalledWith(expect.anything(), 'acme', 'docs', 'trunk');
		expect(ensureDraftPullRequest).toHaveBeenCalledWith(
			expect.anything(),
			'acme',
			'docs',
			'tentman-preview',
			'trunk'
		);
		expect(invalidateCache).toHaveBeenCalledWith('github:acme/docs');
		expect(invalidateRepositoryData).toHaveBeenCalledWith({
			backend: expect.objectContaining({ cacheKey: 'github:acme/docs' }),
			ref: 'tentman-preview',
			changedPaths: ['tentman/configs/press-kit.tentman.json'],
			reason: 'repo-instruction'
		});
	});

	it('rejects stale client plans', async () => {
		const cookies = createCookies();

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
			inputSummary: [
				{
					label: 'Slug',
					value: 'press-kit'
				}
			],
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
			cookies,
			request: new Request('http://localhost/api/repo/instructions', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					instructionId: 'create-page',
					inputValues: {
						slug: 'press-kit'
					},
					plan: {
						instructionId: 'create-page',
						instructionLabel: 'Create page',
						inputValues: { slug: 'stale' },
						confirmationTitle: 'Create stale',
						confirmationSummary: [],
						notes: [],
						files: [],
						navigationChange: null,
						inputErrors: [],
						planErrors: []
					}
				})
			})
		} as never);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			message: 'Instruction plan is stale. Review the confirmation screen again before applying.'
		});
	});

	it('clears the session when GitHub rejects the request', async () => {
		vi.mocked(discoverInstructions).mockRejectedValue({ status: 401 });
		const cookies = createCookies();

		await expect(
			GET({
				locals: repoLocals,
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 401
		});

		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_TOKEN_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(GITHUB_REPO_SESSION_COOKIE, { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(SELECTED_REPO_COOKIE, { path: '/' });
	});
});
