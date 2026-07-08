const MARKDOWN_IMAGE_DESTINATION_PATTERN =
	/!\[[^\]]*]\((?:<([^>\s]+)>|([^\s)]+))((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/g;
const MARKDOWN_LINK_DESTINATION_PATTERN =
	/(?<!!)\[[^\]]*]\((?:<([^>\s]+)>|([^\s)]+))((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/g;
const HTML_ASSET_SRC_PATTERN =
	/<(img|audio|video|source|embed|track)\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\3([^>]*?)>/gi;

function isFileLikeMarkdownDestination(value: string): boolean {
	if (value.startsWith('draft-asset:')) {
		return true;
	}

	const pathname = value.split(/[?#]/, 1)[0] ?? value;
	const filename = pathname.split('/').filter(Boolean).at(-1) ?? '';
	return /\.[a-z0-9]{1,12}$/i.test(filename);
}

export function collectMarkdownAssetValues(value: string): string[] {
	const values: string[] = [];

	for (const match of value.matchAll(MARKDOWN_IMAGE_DESTINATION_PATTERN)) {
		const assetValue = match[1] ?? match[2];
		if (assetValue) {
			values.push(assetValue);
		}
	}

	for (const match of value.matchAll(MARKDOWN_LINK_DESTINATION_PATTERN)) {
		const assetValue = match[1] ?? match[2];
		if (assetValue && isFileLikeMarkdownDestination(assetValue)) {
			values.push(assetValue);
		}
	}

	for (const match of value.matchAll(HTML_ASSET_SRC_PATTERN)) {
		const assetValue = match[4];
		if (assetValue) {
			values.push(assetValue);
		}
	}

	return Array.from(new Set(values));
}

export function collectMarkdownDraftAssetRefs(value: string): string[] {
	return collectMarkdownAssetValues(value).filter((assetValue) =>
		assetValue.startsWith('draft-asset:')
	);
}

export function replaceMarkdownAssetValues(
	value: string,
	replacements: Map<string, string>
): string {
	if (replacements.size === 0) {
		return value;
	}

	const replaceMarkdownDestination = (match: string, angleValue?: string, plainValue?: string) => {
		const assetValue = angleValue ?? plainValue;
		if (!assetValue) {
			return match;
		}

		const replacement = replacements.get(assetValue);
		return replacement ? match.replace(assetValue, replacement) : match;
	};

	let nextValue = value.replace(MARKDOWN_IMAGE_DESTINATION_PATTERN, replaceMarkdownDestination);

	nextValue = nextValue.replace(
		MARKDOWN_LINK_DESTINATION_PATTERN,
		(match, angleValue, plainValue) => {
			const assetValue = angleValue ?? plainValue;
			if (!assetValue || !isFileLikeMarkdownDestination(assetValue)) {
				return match;
			}

			return replaceMarkdownDestination(match, angleValue, plainValue);
		}
	);

	nextValue = nextValue.replace(
		HTML_ASSET_SRC_PATTERN,
		(match, tagName, beforeSrc, quote, assetValue, afterSrc) => {
			const replacement = replacements.get(assetValue);
			return replacement
				? `<${tagName}${beforeSrc}src=${quote}${replacement}${quote}${afterSrc}>`
				: match;
		}
	);

	return nextValue;
}
