import type { Octokit } from 'octokit';

export interface DraftPullRequestSummary {
	number: number;
	url: string;
	title: string;
}

const DRAFT_PULL_REQUEST_TITLE = 'Tentman draft changes';
const DRAFT_PULL_REQUEST_BODY =
	'Managed by Tentman. This pull request tracks the current unpublished site draft.';

async function listOpenDraftPullRequests(
	octokit: Octokit,
	owner: string,
	repo: string,
	headBranch: string
): Promise<DraftPullRequestSummary[]> {
	const { data } = await octokit.rest.pulls.list({
		owner,
		repo,
		state: 'open',
		base: 'main',
		head: `${owner}:${headBranch}`,
		per_page: 10
	});

	return data.map((pullRequest) => ({
		number: pullRequest.number,
		url: pullRequest.html_url,
		title: pullRequest.title
	}));
}

export async function ensureDraftPullRequest(
	octokit: Octokit,
	owner: string,
	repo: string,
	headBranch: string
): Promise<DraftPullRequestSummary> {
	const existing = await listOpenDraftPullRequests(octokit, owner, repo, headBranch);
	if (existing[0]) {
		return existing[0];
	}

	const { data } = await octokit.rest.pulls.create({
		owner,
		repo,
		title: DRAFT_PULL_REQUEST_TITLE,
		body: DRAFT_PULL_REQUEST_BODY,
		head: headBranch,
		base: 'main'
	});

	return {
		number: data.number,
		url: data.html_url,
		title: data.title
	};
}

export async function closeDraftPullRequest(
	octokit: Octokit,
	owner: string,
	repo: string,
	headBranch: string
): Promise<void> {
	const existing = await listOpenDraftPullRequests(octokit, owner, repo, headBranch);
	if (!existing[0]) {
		return;
	}

	await octokit.rest.pulls.update({
		owner,
		repo,
		pull_number: existing[0].number,
		state: 'closed'
	});
}
