import fs from 'node:fs/promises';
import { serializeJson } from './json.js';
import { NAVIGATION_MANIFEST_PATH, parseNavigationManifest, serializeNavigationManifest } from './manifest.js';
import { resolveConfigRelativePath, resolveProjectPath } from './paths.js';

function pushRewrite(rewrites, details) {
	rewrites.push(details);
}

function toPublicRewrite(rewrite) {
	return {
		path: rewrite.path,
		formatter: rewrite.formatter,
		kind: rewrite.kind,
		...(rewrite.configPath ? { configPath: rewrite.configPath } : {})
	};
}

async function collectJsonRewrite(rewrites, absolutePath, relativePath, details = {}) {
	const source = await fs.readFile(absolutePath, 'utf8');
	const nextSource = serializeJson(JSON.parse(source));

	if (nextSource !== source) {
		pushRewrite(rewrites, {
			absolutePath,
			path: relativePath,
			formatter: 'json',
			source,
			nextSource,
			...details
		});
	}
}

async function collectTentmanFormatRewrites(project) {
	const rewrites = [];

	for (const config of project.configs) {
		await collectJsonRewrite(rewrites, resolveProjectPath(project.rootDir, config.path), config.path, {
			kind: 'config'
		});

		if (config.content.mode !== 'file' || !config.content.path.endsWith('.json')) {
			continue;
		}

		const contentPath = resolveConfigRelativePath(project.rootDir, config.path, config.content.path);
		const relativePath = project.contentByConfigPath.get(config.path)?.path ?? config.content.path;
		await collectJsonRewrite(rewrites, contentPath, relativePath, {
			kind: 'content',
			configPath: config.path
		});
	}

	if (project.navigationManifest.exists && project.navigationManifest.manifest && !project.navigationManifest.error) {
		const absolutePath = resolveProjectPath(project.rootDir, NAVIGATION_MANIFEST_PATH);
		const source = await fs.readFile(absolutePath, 'utf8');
		const nextSource = serializeNavigationManifest(parseNavigationManifest(source));

		if (nextSource !== source) {
			pushRewrite(rewrites, {
				absolutePath,
				path: NAVIGATION_MANIFEST_PATH,
				kind: 'navigation-manifest',
				formatter: 'navigation-manifest',
				source,
				nextSource
			});
		}
	}

	return rewrites;
}

export async function checkTentmanFormat(project) {
	const rewrites = await collectTentmanFormatRewrites(project);
	return rewrites.map(toPublicRewrite);
}

export async function writeTentmanFormat(project) {
	const rewrites = await collectTentmanFormatRewrites(project);

	for (const rewrite of rewrites) {
		await fs.writeFile(rewrite.absolutePath, rewrite.nextSource);
	}

	return rewrites.map(toPublicRewrite);
}

export function summarizeFormatCheck(rewrites) {
	return {
		files: rewrites.length,
		configs: rewrites.filter((rewrite) => rewrite.kind === 'config').length,
		content: rewrites.filter((rewrite) => rewrite.kind === 'content').length,
		navigationManifests: rewrites.filter((rewrite) => rewrite.kind === 'navigation-manifest').length
	};
}
