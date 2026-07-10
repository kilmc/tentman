import { describe, expect, it } from 'vitest';
import { getBlockedPublishReview } from './review-cost-guard';

const postsConfig = {
	slug: 'posts',
	path: 'content/posts.tentman.json',
	config: {
		type: 'content',
		label: 'Posts',
		_tentmanId: 'posts',
		collection: {
			sorting: 'manual'
		},
		content: {
			mode: 'directory',
			path: 'src/content/posts',
			template: 'templates/post.md'
		},
		blocks: []
	}
} as const;

describe('review draft cost guard', () => {
	it('allows small scoped item reviews', () => {
		expect(
			getBlockedPublishReview({
				configs: [postsConfig as never],
				changedFiles: [
					{
						filename: 'src/content/posts/hello.md',
						status: 'modified'
					}
				]
			})
		).toBeNull();
	});

	it('blocks reviews that would read too many item documents', () => {
		const changedFiles = Array.from({ length: 21 }, (_, index) => ({
			filename: `src/content/posts/post-${index}.md`,
			status: 'modified'
		}));

		const blockedReview = getBlockedPublishReview({
			configs: [postsConfig as never],
			changedFiles
		});

		expect(blockedReview).toMatchObject({
			changedFileCount: 21,
			estimatedReviewDocumentReads: 42
		});
		expect(blockedReview?.reasons[0]).toContain('42 content document reads');
	});

	it('blocks changed file sets above the safety limit before review building', () => {
		const changedFiles = Array.from({ length: 81 }, (_, index) => ({
			filename: `static/file-${index}.txt`,
			status: 'modified'
		}));

		const blockedReview = getBlockedPublishReview({
			configs: [postsConfig as never],
			changedFiles
		});

		expect(blockedReview).toMatchObject({
			changedFileCount: 81,
			estimatedReviewDocumentReads: 0
		});
		expect(blockedReview?.reasons[0]).toContain('81 changed files');
	});

	it('blocks changes that would fall back to unbounded collection review', () => {
		const blockedReview = getBlockedPublishReview({
			configs: [postsConfig as never],
			changedFiles: [
				{
					filename: 'src/content/posts/after.md',
					previous_filename: 'src/content/posts/before.md',
					status: 'renamed'
				}
			]
		});

		expect(blockedReview?.reasons[0]).toContain('unbounded collection review');
	});
});
