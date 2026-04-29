import path from 'node:path';

export function toPosixPath(value) {
	return value.split(path.sep).join('/');
}

export function stripLeadingDotSlash(value) {
	return value.replace(/^\.\//, '').replace(/\/+$/, '');
}

export function resolveProjectPath(rootDir, relativePath) {
	return path.resolve(rootDir, stripLeadingDotSlash(relativePath));
}

export function resolveConfigRelativePath(rootDir, configPath, configuredPath) {
	const normalized = stripLeadingDotSlash(configuredPath);

	if (normalized.startsWith('/')) {
		return path.resolve(rootDir, `.${normalized}`);
	}

	return path.resolve(rootDir, path.dirname(configPath), normalized);
}

export function getPathRelativeToRoot(rootDir, absolutePath) {
	return toPosixPath(path.relative(rootDir, absolutePath));
}
