import { describe, expect, it } from 'vitest';
import {
	assetPickerEntryMatchesFilter,
	audioAssetFilter,
	createAssetPickerPublicPath,
	fileAssetFilter,
	imageAssetFilter,
	listAssetPickerEntries,
	videoAssetFilter
} from '$lib/features/assets/asset-picker';
import type { RepoEntry, RepositoryBackend } from '$lib/repository/types';

function createBackend(
	entriesByPath: Record<string, RepoEntry[]>
): Pick<RepositoryBackend, 'listDirectory'> {
	return {
		async listDirectory(path: string) {
			return entriesByPath[path] ?? [];
		}
	};
}

describe('asset picker helpers', () => {
	it('matches configured extensions case-insensitively', () => {
		expect(assetPickerEntryMatchesFilter('static/images/Hero.JPG', imageAssetFilter)).toBe(true);
		expect(assetPickerEntryMatchesFilter('static/images/Hero.txt', imageAssetFilter)).toBe(false);
		expect(assetPickerEntryMatchesFilter('static/assets/Trailer.MP4', videoAssetFilter)).toBe(true);
		expect(assetPickerEntryMatchesFilter('static/assets/Interview.M4A', audioAssetFilter)).toBe(
			true
		);
		expect(assetPickerEntryMatchesFilter('static/assets/Brief.PDF', fileAssetFilter)).toBe(true);
	});

	it('lists matching assets recursively and sorts by relative path', async () => {
		const backend = createBackend({
			'static/images': [
				{ name: 'posts', path: 'static/images/posts', kind: 'directory' },
				{ name: 'logo.svg', path: 'static/images/logo.svg', kind: 'file' },
				{ name: 'notes.txt', path: 'static/images/notes.txt', kind: 'file' }
			],
			'static/images/posts': [
				{ name: 'hero.PNG', path: 'static/images/posts/hero.PNG', kind: 'file' }
			]
		});

		await expect(
			listAssetPickerEntries({
				backend,
				config: {
					assetPath: 'static/images/',
					publicPath: '/images'
				},
				filter: imageAssetFilter
			})
		).resolves.toEqual([
			expect.objectContaining({
				name: 'logo.svg',
				repoPath: 'static/images/logo.svg',
				relativePath: 'logo.svg',
				publicPath: '/images/logo.svg'
			}),
			expect.objectContaining({
				name: 'hero.PNG',
				repoPath: 'static/images/posts/hero.PNG',
				relativePath: 'posts/hero.PNG',
				publicPath: '/images/posts/hero.PNG'
			})
		]);
	});

	it('constructs public paths defensively', () => {
		expect(createAssetPickerPublicPath('posts/hero.jpg', '/images/')).toBe(
			'/images/posts/hero.jpg'
		);
		expect(createAssetPickerPublicPath('hero.jpg', '/')).toBe('/hero.jpg');
		expect(createAssetPickerPublicPath('../hero.jpg', '/images')).toBeNull();
		expect(createAssetPickerPublicPath('/hero.jpg', '/images')).toBeNull();
	});

	it('returns an empty list when asset config is missing', async () => {
		await expect(
			listAssetPickerEntries({
				backend: createBackend({}),
				config: {
					assetPath: '',
					publicPath: '/images'
				},
				filter: imageAssetFilter
			})
		).resolves.toEqual([]);
	});
});
