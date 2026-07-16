import type { Octokit } from 'octokit';
import { traceGitHubRequest } from '$lib/utils/workflow-instrumentation';

/**
 * Represents a commit in a branch comparison
 */
export interface Commit {
	sha: string;
	message: string;
	author: {
		name: string;
		email: string;
		date: string;
	};
	url: string;
}

export interface BranchChangedFile {
	filename: string;
	status: string;
	previous_filename?: string;
}

/**
 * Creates a new branch from a base branch
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branchName - Name of the new branch to create
 * @param fromBranch - Base branch to create from
 */
export async function createBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	branchName: string,
	fromBranch: string
): Promise<void> {
	try {
		// Get the base branch reference to get its SHA
		const { data: ref } = await traceGitHubRequest(
			{
				source: 'github-helper',
				operation: 'createBranchReadRef',
				requestKind: 'ref',
				repoKey: `github:${owner}/${repo}`,
				owner,
				repo,
				ref: fromBranch
			},
			() =>
				octokit.rest.git.getRef({
					owner,
					repo,
					ref: `heads/${fromBranch}`
				})
		);

		// Create new branch pointing to the same SHA
		await traceGitHubRequest(
			{
				source: 'github-helper',
				operation: 'createBranchWriteRef',
				requestKind: 'ref',
				repoKey: `github:${owner}/${repo}`,
				owner,
				repo,
				ref: branchName,
				sha: ref.object.sha
			},
			() =>
				octokit.rest.git.createRef({
					owner,
					repo,
					ref: `refs/heads/${branchName}`,
					sha: ref.object.sha
				})
		);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to create branch:', { branchName, fromBranch, error: err });
		throw new Error(`Failed to create branch ${branchName}: ${errorMessage}`);
	}
}

/**
 * Deletes a branch from the repository
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branchName - Name of the branch to delete
 */
export async function deleteBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	branchName: string
): Promise<void> {
	try {
		await traceGitHubRequest(
			{
				source: 'github-helper',
				operation: 'deleteBranchRef',
				requestKind: 'delete',
				repoKey: `github:${owner}/${repo}`,
				owner,
				repo,
				ref: branchName
			},
			() =>
				octokit.rest.git.deleteRef({
					owner,
					repo,
					ref: `heads/${branchName}`
				})
		);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to delete branch:', { branchName, error: err });
		throw new Error(`Failed to delete branch ${branchName}: ${errorMessage}`);
	}
}

/**
 * Gets the list of commits in a head branch that are not in the base branch
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param baseBranch - Base branch to compare against
 * @param headBranch - Head branch with new commits
 * @returns Array of commits that are in head but not in base
 */
export async function getCommitsSince(
	octokit: Octokit,
	owner: string,
	repo: string,
	baseBranch: string,
	headBranch: string
): Promise<Commit[]> {
	try {
		const { data: comparison } = await traceGitHubRequest(
			{
				source: 'github-helper',
				operation: 'getCommitsSince',
				requestKind: 'compare',
				repoKey: `github:${owner}/${repo}`,
				owner,
				repo,
				ref: headBranch,
				path: `${baseBranch}...${headBranch}`
			},
			() =>
				octokit.rest.repos.compareCommits({
					owner,
					repo,
					base: baseBranch,
					head: headBranch
				})
		);

		// Map GitHub's commit format to our simplified format
		return comparison.commits.map((commit) => ({
			sha: commit.sha,
			message: commit.commit.message,
			author: {
				name: commit.commit.author?.name || 'Unknown',
				email: commit.commit.author?.email || '',
				date: commit.commit.author?.date || new Date().toISOString()
			},
			url: commit.html_url
		}));
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to get commits:', { baseBranch, headBranch, error: err });
		throw new Error(
			`Failed to get commits between ${baseBranch} and ${headBranch}: ${errorMessage}`
		);
	}
}

export async function listChangedFilesBetweenRefs(
	octokit: Octokit,
	owner: string,
	repo: string,
	baseBranch: string,
	headBranch: string
): Promise<BranchChangedFile[]> {
	const files: BranchChangedFile[] = [];
	let page = 1;

	while (true) {
		const response = await traceGitHubRequest(
			{
				source: 'github-helper',
				operation: 'listChangedFilesBetweenRefs',
				requestKind: 'compare',
				repoKey: `github:${owner}/${repo}`,
				owner,
				repo,
				ref: headBranch,
				path: `${baseBranch}...${headBranch}`
			},
			() =>
				octokit.rest.repos.compareCommits({
					owner,
					repo,
					base: baseBranch,
					head: headBranch,
					per_page: 100,
					page
				})
		);

		for (const file of response.data.files ?? []) {
			files.push({
				filename: file.filename,
				status: file.status,
				...(file.previous_filename ? { previous_filename: file.previous_filename } : {})
			});
		}

		if ((response.data.files?.length ?? 0) < 100) {
			break;
		}

		page += 1;
	}

	return files;
}
