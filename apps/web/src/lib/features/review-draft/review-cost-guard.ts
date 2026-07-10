import type { DiscoveredConfig } from '$lib/config/discovery';
import type { BranchChangedFile } from '$lib/github/branch';
import {
	getChangedFilePaths,
	isConfigContentFileChange
} from '$lib/server/repository-data/path-classification';

export const REVIEW_DRAFT_COST_LIMITS = {
	maxChangedFiles: 80,
	maxReviewDocumentReads: 40
} as const;

export interface BlockedPublishReview {
	title: string;
	message: string;
	changedFileCount: number;
	estimatedReviewDocumentReads: number;
	limits: typeof REVIEW_DRAFT_COST_LIMITS;
	reasons: string[];
}

type CostGuardChangedFile = BranchChangedFile & {
	previousFilename?: string;
};

function getReviewReadCost(file: CostGuardChangedFile): number | null {
	switch (file.status) {
		case 'added':
			return 1;
		case 'removed':
			return 1;
		case 'modified':
		case 'changed':
			return 2;
		default:
			return null;
	}
}

function getConfigReviewReadCost(
	config: DiscoveredConfig,
	files: CostGuardChangedFile[]
): number | null {
	if (config.config.content.mode === 'file') {
		return files.some((file) => isConfigContentFileChange(config, file)) ? 2 : 0;
	}

	let cost = 0;

	for (const file of files) {
		if (!isConfigContentFileChange(config, file)) {
			continue;
		}

		if (getChangedFilePaths(file).length !== 1) {
			return null;
		}

		const fileCost = getReviewReadCost(file);
		if (fileCost === null) {
			return null;
		}

		cost += fileCost;
	}

	return cost;
}

function buildBlockedPublishReview(input: {
	changedFileCount: number;
	estimatedReviewDocumentReads: number;
	reasons: string[];
}): BlockedPublishReview {
	return {
		title: 'Review Draft blocked',
		message:
			'This draft could trigger an unusually large number of repository reads. Tentman stopped before loading the review. Contact Kilian before continuing.',
		changedFileCount: input.changedFileCount,
		estimatedReviewDocumentReads: input.estimatedReviewDocumentReads,
		limits: REVIEW_DRAFT_COST_LIMITS,
		reasons: input.reasons
	};
}

export function getBlockedPublishReview(input: {
	configs: DiscoveredConfig[];
	changedFiles: CostGuardChangedFile[];
}): BlockedPublishReview | null {
	const reasons: string[] = [];
	let estimatedReviewDocumentReads = 0;

	if (input.changedFiles.length > REVIEW_DRAFT_COST_LIMITS.maxChangedFiles) {
		reasons.push(
			`The draft contains ${input.changedFiles.length} changed files, which is above the ${REVIEW_DRAFT_COST_LIMITS.maxChangedFiles} file safety limit.`
		);
	}

	for (const config of input.configs) {
		const readCost = getConfigReviewReadCost(config, input.changedFiles);
		if (readCost === null) {
			reasons.push(
				`${config.config.label} includes changes that would require an unbounded collection review.`
			);
			continue;
		}

		estimatedReviewDocumentReads += readCost;
	}

	if (estimatedReviewDocumentReads > REVIEW_DRAFT_COST_LIMITS.maxReviewDocumentReads) {
		reasons.push(
			`The review would need about ${estimatedReviewDocumentReads} content document reads, which is above the ${REVIEW_DRAFT_COST_LIMITS.maxReviewDocumentReads} read safety limit.`
		);
	}

	if (!reasons.length) {
		return null;
	}

	return buildBlockedPublishReview({
		changedFileCount: input.changedFiles.length,
		estimatedReviewDocumentReads,
		reasons
	});
}
