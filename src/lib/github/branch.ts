import type { Octokit } from 'octokit';

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

/**
 * Creates a new branch from a base branch
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branchName - Name of the new branch to create
 * @param fromBranch - Base branch to create from (defaults to 'main')
 */
export async function createBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	branchName: string,
	fromBranch: string = 'main'
): Promise<void> {
	try {
		// Get the base branch reference to get its SHA
		const { data: ref } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${fromBranch}`
		});

		// Create new branch pointing to the same SHA
		await octokit.rest.git.createRef({
			owner,
			repo,
			ref: `refs/heads/${branchName}`,
			sha: ref.object.sha
		});
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
		await octokit.rest.git.deleteRef({
			owner,
			repo,
			ref: `heads/${branchName}`
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to delete branch:', { branchName, error: err });
		throw new Error(`Failed to delete branch ${branchName}: ${errorMessage}`);
	}
}

/**
 * Merges a head branch into a base branch
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param headBranch - Branch to merge from
 * @param baseBranch - Branch to merge into
 * @param commitMessage - Commit message for the merge
 */
export async function mergeBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	headBranch: string,
	baseBranch: string,
	commitMessage: string
): Promise<void> {
	try {
		await octokit.rest.repos.merge({
			owner,
			repo,
			base: baseBranch,
			head: headBranch,
			commit_message: commitMessage
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to merge branch:', { headBranch, baseBranch, error: err });
		throw new Error(`Failed to merge ${headBranch} into ${baseBranch}: ${errorMessage}`);
	}
}

/**
 * Checks if a branch exists in the repository
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branchName - Name of the branch to check
 * @returns True if the branch exists, false otherwise
 */
export async function branchExists(
	octokit: Octokit,
	owner: string,
	repo: string,
	branchName: string
): Promise<boolean> {
	try {
		await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${branchName}`
		});
		return true;
	} catch (err) {
		// If we get a 404, the branch doesn't exist
		if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
			return false;
		}
		// For other errors, rethrow
		throw err;
	}
}

/**
 * Gets the SHA of a branch's latest commit
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branchName - Name of the branch
 * @returns The SHA of the branch's latest commit
 */
export async function getBranchSHA(
	octokit: Octokit,
	owner: string,
	repo: string,
	branchName: string
): Promise<string> {
	try {
		const { data: ref } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${branchName}`
		});
		return ref.object.sha;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to get branch SHA:', { branchName, error: err });
		throw new Error(`Failed to get SHA for branch ${branchName}: ${errorMessage}`);
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
		const { data: comparison } = await octokit.rest.repos.compareCommits({
			owner,
			repo,
			base: baseBranch,
			head: headBranch
		});

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

/**
 * Represents a preview branch with metadata
 */
export interface PreviewBranch {
	name: string;              // Full branch name: preview-yyyy-mm-dd or preview-yyyy-mm-dd-2
	date: string;              // Extracted date: yyyy-mm-dd
	sequence: number;          // Sequence number if multiple branches same day (1, 2, 3...)
	lastCommitDate: string;    // Date of last commit
	lastCommitSha: string;     // SHA of last commit
}

/**
 * Lists all preview branches in the repository
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Array of preview branches with metadata, sorted by date descending
 */
export async function listPreviewBranches(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<PreviewBranch[]> {
	try {
		// GitHub API paginates at 100 per page, but preview branches should be small
		const { data: branches } = await octokit.rest.repos.listBranches({
			owner,
			repo,
			per_page: 100
		});

		const previewBranches: PreviewBranch[] = [];

		for (const branch of branches) {
			// Match new format: preview-yyyy-mm-dd or preview-yyyy-mm-dd-N
			const pattern = /^preview-(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;
			const match = branch.name.match(pattern);

			if (match) {
				const [, date, sequenceStr] = match;
				const sequence = sequenceStr ? parseInt(sequenceStr, 10) : 1;

				// Get the last commit info
				const { data: commit } = await octokit.rest.repos.getCommit({
					owner,
					repo,
					ref: branch.commit.sha
				});

				previewBranches.push({
					name: branch.name,
					date,
					sequence,
					lastCommitDate: commit.commit.author?.date || new Date().toISOString(),
					lastCommitSha: branch.commit.sha
				});
			}
		}

		// Sort by date descending (newest first), then by sequence
		return previewBranches.sort((a, b) => {
			const dateCompare = b.date.localeCompare(a.date);
			if (dateCompare !== 0) return dateCompare;
			return b.sequence - a.sequence;
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to list preview branches:', { error: err });
		throw new Error(`Failed to list preview branches: ${errorMessage}`);
	}
}

