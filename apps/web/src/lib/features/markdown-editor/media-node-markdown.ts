import type {
	MarkdownMediaAttrs,
	MarkdownMediaKind,
	MarkdownMediaSource,
	MarkdownMediaTrack
} from './media-node-types';

type MediaElementLike = {
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
	querySelectorAll(selector: string): Iterable<Element>;
};

function normalizeOptionalString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

function getAttr(element: Pick<MediaElementLike, 'getAttribute'>, name: string): string | null {
	return normalizeOptionalString(element.getAttribute(name));
}

function getBooleanAttr(
	element: Pick<MediaElementLike, 'hasAttribute'>,
	name: string
): boolean | undefined {
	return element.hasAttribute(name) ? true : undefined;
}

export function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export function renderBooleanAttribute(name: string, value: boolean | null | undefined): string {
	return value ? ` ${name}` : '';
}

function renderStringAttribute(name: string, value: string | null | undefined): string {
	return value ? ` ${name}="${escapeHtmlAttribute(value)}"` : '';
}

function renderOpeningAttrs(attrs: MarkdownMediaAttrs): string {
	return [
		renderBooleanAttribute('controls', attrs.controls),
		renderStringAttribute('src', attrs.src),
		renderStringAttribute('poster', attrs.poster),
		renderStringAttribute('title', attrs.title),
		renderStringAttribute('aria-label', attrs.ariaLabel)
	].join('');
}

function renderSource(source: MarkdownMediaSource): string {
	return `<source${renderStringAttribute('src', source.src)}${renderStringAttribute(
		'type',
		source.type
	)}>`;
}

function renderTrack(track: MarkdownMediaTrack): string {
	return `<track${renderStringAttribute('src', track.src)}${renderStringAttribute(
		'kind',
		track.kind
	)}${renderStringAttribute('label', track.label)}${renderStringAttribute(
		'srclang',
		track.srclang
	)}${renderBooleanAttribute('default', track.default)}>`;
}

function normalizeSources(value: unknown): MarkdownMediaSource[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.reduce<MarkdownMediaSource[]>((sources, source) => {
		if (!source || typeof source !== 'object') {
			return sources;
		}

		const src = normalizeOptionalString((source as MarkdownMediaSource).src);
		if (!src) {
			return sources;
		}

		sources.push({
			src,
			type: normalizeOptionalString((source as MarkdownMediaSource).type)
		});
		return sources;
	}, []);
}

function normalizeTracks(value: unknown): MarkdownMediaTrack[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.reduce<MarkdownMediaTrack[]>((tracks, track) => {
		if (!track || typeof track !== 'object') {
			return tracks;
		}

		const src = normalizeOptionalString((track as MarkdownMediaTrack).src);
		if (!src) {
			return tracks;
		}

		tracks.push({
			src,
			kind: normalizeOptionalString((track as MarkdownMediaTrack).kind),
			label: normalizeOptionalString((track as MarkdownMediaTrack).label),
			srclang: normalizeOptionalString((track as MarkdownMediaTrack).srclang),
			default: (track as MarkdownMediaTrack).default === true
		});
		return tracks;
	}, []);
}

export function normalizeMarkdownMediaAttrs(attrs: MarkdownMediaAttrs): MarkdownMediaAttrs {
	const sources = normalizeSources(attrs.sources);
	const tracks = normalizeTracks(attrs.tracks);

	return {
		src: normalizeOptionalString(attrs.src),
		poster: normalizeOptionalString(attrs.poster),
		title: normalizeOptionalString(attrs.title),
		ariaLabel: normalizeOptionalString(attrs.ariaLabel),
		controls: attrs.controls === false ? false : Boolean(attrs.controls),
		sources,
		tracks
	};
}

export function parseMediaElementAttributes(
	element: MediaElementLike,
	kind: MarkdownMediaKind
): MarkdownMediaAttrs {
	const sources = [...element.querySelectorAll('source')]
		.map((source) => ({
			src: getAttr(source, 'src') ?? '',
			type: getAttr(source, 'type')
		}))
		.filter((source) => source.src);
	const tracks =
		kind === 'video'
			? [...element.querySelectorAll('track')]
					.map((track) => ({
						src: getAttr(track, 'src') ?? '',
						kind: getAttr(track, 'kind'),
						label: getAttr(track, 'label'),
						srclang: getAttr(track, 'srclang'),
						default: track.hasAttribute('default')
					}))
					.filter((track) => track.src)
			: [];

	return normalizeMarkdownMediaAttrs({
		src: getAttr(element, 'src'),
		poster: kind === 'video' ? getAttr(element, 'poster') : null,
		title: getAttr(element, 'title'),
		ariaLabel: getAttr(element, 'aria-label'),
		controls: getBooleanAttr(element, 'controls'),
		sources,
		tracks
	});
}

function renderMediaMarkdown(kind: MarkdownMediaKind, attrs: MarkdownMediaAttrs): string {
	const normalized = normalizeMarkdownMediaAttrs(attrs);
	const sources = normalized.sources ?? [];
	const tracks = kind === 'video' ? (normalized.tracks ?? []) : [];
	const hasChildren = sources.length > 0 || tracks.length > 0;
	const openingAttrs = renderOpeningAttrs({
		...normalized,
		src: hasChildren ? null : normalized.src,
		poster: kind === 'video' ? normalized.poster : null
	});

	if (!hasChildren) {
		return `<${kind}${openingAttrs}></${kind}>`;
	}

	const children = [...sources.map(renderSource), ...tracks.map(renderTrack)].join('');
	return `<${kind}${openingAttrs}>${children}</${kind}>`;
}

export function renderAudioMarkdown(attrs: MarkdownMediaAttrs): string {
	return renderMediaMarkdown('audio', attrs);
}

export function renderVideoMarkdown(attrs: MarkdownMediaAttrs): string {
	return renderMediaMarkdown('video', attrs);
}

export function getPrimaryMediaSrc(attrs: MarkdownMediaAttrs): string | null {
	const normalized = normalizeMarkdownMediaAttrs(attrs);
	return normalized.src ?? normalized.sources?.[0]?.src ?? null;
}
