import { describe, expect, it } from 'vitest';
import { classifyReviewDraftChangedFiles } from './candidate-changes';

describe('review draft candidate changes', () => {
	it('maps content files to the correct config slug and keeps unmappable Tentman files narrow', () => {
		const result = classifyReviewDraftChangedFiles(
			[
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						type: 'content',
						label: 'Posts',
						_tentmanId: 'posts',
						collection: {
							sorting: 'manual'
						},
						idField: 'slug',
						content: {
							mode: 'directory',
							path: 'src/content/posts',
							template: 'templates/post.md'
						},
						blocks: []
					}
				}
			] as never,
			[
				{
					filename: 'src/content/posts/hello-world.md',
					status: 'modified'
				},
				{
					filename: 'tentman/custom-review-note.json',
					status: 'modified'
				},
				{
					filename: 'src/routes/+page.svelte',
					status: 'modified'
				}
			]
		);

		expect(result.configFilesBySlug.get('posts')).toHaveLength(1);
		expect(result.otherTentmanFiles).toEqual([
			{
				filename: 'tentman/custom-review-note.json',
				status: 'modified'
			}
		]);
		expect(result.hiddenFiles).toEqual([
			{
				filename: 'src/routes/+page.svelte',
				status: 'modified'
			}
		]);
	});

	it('maps renamed files by their previous path', () => {
		const result = classifyReviewDraftChangedFiles(
			[
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						type: 'content',
						label: 'Posts',
						_tentmanId: 'posts',
						collection: true,
						idField: 'slug',
						content: {
							mode: 'directory',
							path: 'src/content/posts',
							template: 'templates/post.md'
						},
						blocks: []
					}
				}
			] as never,
			[
				{
					filename: 'src/content/archive/hello-world.md',
					previousFilename: 'src/content/posts/hello-world.md',
					status: 'renamed'
				}
			]
		);

		expect(result.configFilesBySlug.get('posts')).toEqual([
			{
				filename: 'src/content/archive/hello-world.md',
				previousFilename: 'src/content/posts/hello-world.md',
				status: 'renamed'
			}
		]);
		expect(result.hiddenFiles).toEqual([]);
	});
});
