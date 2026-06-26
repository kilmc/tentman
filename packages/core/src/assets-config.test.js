import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildManagedAssetPublicPath,
	buildManagedAssetRepoPath,
	getRootAssetsConfigDiagnostics,
	parseRootAssetsConfig,
	resolveManagedAssetValue
} from './index.js';

test('normalizes root asset config', () => {
	assert.deepEqual(
		parseRootAssetsConfig({
			path: './tentman/configs/assets',
			publicPath: '/assets/'
		}),
		{
			path: 'tentman/configs/assets/',
			publicPath: '/assets'
		}
	);

	assert.deepEqual(parseRootAssetsConfig({ path: 'assets', publicPath: '/' }), {
		path: 'assets/',
		publicPath: '/'
	});
});

test('rejects unsafe root asset config shapes', () => {
	for (const path of ['/tmp/assets', '../assets', '~/assets', 'https://example.com/assets', 'C:\\assets']) {
		assert.throws(() => parseRootAssetsConfig({ path, publicPath: '/assets' }));
	}

	for (const publicPath of ['assets', 'https://example.com/assets', '/assets/../secret', '/assets?v=1']) {
		assert.throws(() => parseRootAssetsConfig({ path: './assets', publicPath }));
	}
});

test('resolves issue #39 public asset mapping', () => {
	const assets = parseRootAssetsConfig({
		path: './tentman/configs/assets',
		publicPath: '/assets'
	});

	assert.equal(
		buildManagedAssetRepoPath('/assets/05-skiingdino_carolinabuzio.jpg', assets),
		'tentman/configs/assets/05-skiingdino_carolinabuzio.jpg'
	);
	assert.equal(
		buildManagedAssetPublicPath('05-skiingdino_carolinabuzio.jpg', assets),
		'/assets/05-skiingdino_carolinabuzio.jpg'
	);
});

test('reports legacy assetsDir without using it as behavior', () => {
	const diagnostics = getRootAssetsConfigDiagnostics({
		assetsDir: './static/images',
		assets: {
			path: './assets',
			publicPath: '/assets'
		}
	});

	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.code, 'assets.legacy-assets-dir');
});

test('marks invalid managed values without resolving them', () => {
	const assets = parseRootAssetsConfig({ path: './assets', publicPath: '/assets' });

	assert.deepEqual(resolveManagedAssetValue('/other/photo.jpg', assets), {
		ignored: false,
		valid: false,
		reason: 'public-path-mismatch'
	});
	assert.deepEqual(resolveManagedAssetValue('../photo.jpg', assets), {
		ignored: false,
		valid: false,
		reason: 'traversal'
	});
	assert.equal(resolveManagedAssetValue('https://example.com/photo.jpg', assets).ignored, true);
});
