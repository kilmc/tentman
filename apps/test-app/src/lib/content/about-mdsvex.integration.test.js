import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { compile } from 'mdsvex';
import remarkDirective from 'remark-directive';
import { tentmanComponents } from '@tentman/mdsvex';

const testAppRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const aboutRoutePath = path.join(testAppRoot, 'src/routes/about/+page.md');

test('the canonical about markdown route compiles with auto Tentman context', async () => {
	const source = await fs.readFile(aboutRoutePath, 'utf8');
	const rendered = await compile(source, {
		filename: aboutRoutePath,
		extensions: ['.svx', '.md'],
		remarkPlugins: [
			remarkDirective,
			tentmanComponents({
				projectRoot: testAppRoot,
				resolveTentmanContext: 'auto'
			})
		]
	});

	if (typeof rendered?.code !== 'string') {
		throw new Error('Failed to compile the about route markdown file');
	}

	assert.match(rendered.code, /import GalleryEmbed from '\$lib\/components\/GalleryEmbed\.svelte';/);
	assert.match(
		rendered.code,
		/<GalleryEmbed gallery=\{\{"title":"Reusable image block","description":"This page uses the shared image block data through a marker-only mdsvex component, so the route file stays the live content source\./
	);
	assert.match(rendered.code, /content-link content-link--strong/);
});
